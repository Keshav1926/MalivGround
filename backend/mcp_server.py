import sys
import os
from pathlib import Path

# Make this script runnable from any directory
_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_root))

import asyncio
import json
from datetime import datetime, timezone
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

from backend import storage
from backend.models import QnA, Conflict
from backend.master_llm import get_master_llm, load_config


def now() -> datetime:
    return datetime.now(timezone.utc)


# --- Auth (Phase 3d): identify caller via MALIV_API_KEY env var ---

_authed_user = None  # populated lazily on first call


def _identify_caller() -> dict:
    """Resolve the calling user from MALIV_API_KEY (if auth is configured).
    Returns {username, role} or {username: 'anonymous', role: 'guest'}.
    """
    global _authed_user
    if _authed_user is not None:
        return _authed_user
    api_key = os.environ.get("MALIV_API_KEY", "").strip()
    if api_key:
        user = storage.find_user_by_api_key(api_key) if hasattr(storage, "find_user_by_api_key") else None
        if user:
            _authed_user = {"username": user.username, "role": user.role, "id": user.id}
            return _authed_user
    _authed_user = {"username": "anonymous", "role": "guest", "id": None}
    return _authed_user


def _can(role: str, action: str) -> bool:
    """Permission gate. Roles: admin, pa, lead, dev, qa, guest."""
    matrix = {
        "admin": {"create", "edit_spec", "answer", "ask", "flag", "resolve", "summarize", "users"},
        "pa": {"create", "edit_spec", "answer", "ask", "flag", "resolve", "summarize"},
        "lead": {"create", "edit_spec", "answer", "ask", "flag", "resolve", "summarize"},
        "dev": {"ask", "flag"},
        "qa": {"ask", "flag"},
        "guest": {"ask", "flag"},  # backwards-compat: unauthed callers can still ask
    }
    return action in matrix.get(role, set())


app = Server("maliv-ground")


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="list_projects",
            description="Returns all projects with id, title, status, and feature_count. Projects group related features.",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="get_project_context",
            description="Returns a project's metadata and the list of features it contains.",
            inputSchema={
                "type": "object",
                "properties": {"project_id": {"type": "string"}},
                "required": ["project_id"],
            },
        ),
        types.Tool(
            name="list_features",
            description="Returns features. Optionally filter by project_id to get only features in one project.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Optional project slug to filter by"}
                },
            },
        ),
        types.Tool(
            name="get_feature_context",
            description="Returns spec + answered Q&A + attached spec file metadata. Pass mode='summary' for token-efficient compressed view (requires Master LLM enabled).",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_id": {"type": "string", "description": "The feature slug ID"},
                    "mode": {"type": "string", "enum": ["full", "summary"], "description": "Optional. Defaults to config.json context_pull_mode."},
                },
                "required": ["feature_id"],
            },
        ),
        types.Tool(
            name="list_spec_files",
            description="List the markdown spec files attached to a feature (metadata only).",
            inputSchema={
                "type": "object",
                "properties": {"feature_id": {"type": "string"}},
                "required": ["feature_id"],
            },
        ),
        types.Tool(
            name="get_spec_file",
            description="Fetch the full text content of a markdown spec file attached to a feature.",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_id": {"type": "string"},
                    "filename": {"type": "string", "description": "e.g. 'api-design.md'"},
                },
                "required": ["feature_id", "filename"],
            },
        ),
        types.Tool(
            name="ask_question",
            description="Post a question/doubt for a feature — stored as pending for PA to answer. Caller is identified via MALIV_API_KEY when auth is configured.",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_id": {"type": "string"},
                    "question": {"type": "string"},
                    "asked_by": {"type": "string", "description": "Optional fallback if no API key set"},
                },
                "required": ["feature_id", "question"],
            },
        ),
        types.Tool(
            name="answer_question",
            description="Answer a pending question. Requires PA/lead/admin role.",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_id": {"type": "string"},
                    "question_id": {"type": "string"},
                    "answer": {"type": "string"},
                    "answered_by": {"type": "string", "description": "Optional fallback if no API key set"},
                },
                "required": ["feature_id", "question_id", "answer"],
            },
        ),
        types.Tool(
            name="get_pending_questions",
            description="Returns all unanswered questions for a feature",
            inputSchema={
                "type": "object",
                "properties": {"feature_id": {"type": "string"}},
                "required": ["feature_id"],
            },
        ),
        types.Tool(
            name="flag_conflict",
            description="Flag a contradiction/conflict for a feature.",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_id": {"type": "string"},
                    "description": {"type": "string"},
                    "flagged_by": {"type": "string", "description": "Optional fallback if no API key set"},
                },
                "required": ["feature_id", "description"],
            },
        ),
        types.Tool(
            name="regenerate_summary",
            description="Force-regenerate the knowledge graph summary for a feature. Requires Master LLM enabled and PA/lead/admin role.",
            inputSchema={
                "type": "object",
                "properties": {"feature_id": {"type": "string"}},
                "required": ["feature_id"],
            },
        ),
        types.Tool(
            name="whoami",
            description="Returns the authenticated user (or anonymous if no API key set).",
            inputSchema={"type": "object", "properties": {}},
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    def text(data) -> list[types.TextContent]:
        return [types.TextContent(type="text", text=json.dumps(data, indent=2, default=str))]

    user = _identify_caller()

    if name == "whoami":
        return text(user)

    if name == "list_projects":
        projects = storage.list_projects()
        out = []
        for p in projects:
            count = len(storage.list_features(project_id=p.id))
            out.append({"id": p.id, "title": p.title, "status": p.status, "feature_count": count})
        return text(out)

    if name == "get_project_context":
        pid = arguments["project_id"]
        p = storage.load_project(pid)
        if not p:
            return text({"error": f"Project '{pid}' not found"})
        features = storage.list_features(project_id=pid)
        return text({
            "project_id": p.id,
            "title": p.title,
            "description": p.description,
            "status": p.status,
            "tags": p.tags,
            "features": [
                {"id": f.id, "title": f.title, "status": f.status}
                for f in features
            ],
        })

    if name == "list_features":
        pid_filter = arguments.get("project_id")
        features = storage.list_features(project_id=pid_filter)
        return text([
            {"id": f.id, "title": f.title, "status": f.status, "project_id": f.project_id}
            for f in features
        ])

    if name == "list_spec_files":
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        return text([sf.model_dump(mode="json") for sf in f.spec_files])

    if name == "get_spec_file":
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        content = storage.load_spec_file(fid, arguments["filename"])
        if content is None:
            return text({"error": f"Spec file '{arguments['filename']}' not found"})
        return [types.TextContent(type="text", text=content)]

    if name == "get_feature_context":
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})

        cfg = load_config()
        mode = arguments.get("mode") or cfg.get("context_pull_mode", "full")

        if mode == "summary" and f.knowledge_graph_summary:
            return text({
                "feature_id": f.id,
                "title": f.title,
                "project_id": f.project_id,
                "mode": "summary",
                "summary": f.knowledge_graph_summary,
                "summary_generated_at": str(f.summary_generated_at) if f.summary_generated_at else None,
                "open_conflicts": [c.model_dump(mode="json") for c in f.conflicts if not c.resolved],
                "spec_files": [sf.model_dump(mode="json") for sf in f.spec_files],
            })

        answered = [q.model_dump(mode="json") for q in f.qa if q.status == "answered"]
        return text({
            "feature_id": f.id,
            "title": f.title,
            "project_id": f.project_id,
            "mode": "full",
            "spec": f.spec.current,
            "viability_warnings": f.spec.viability_warnings,
            "answered_qa": answered,
            "open_conflicts": [c.model_dump(mode="json") for c in f.conflicts if not c.resolved],
            "spec_files": [sf.model_dump(mode="json") for sf in f.spec_files],
        })

    if name == "ask_question":
        if not _can(user["role"], "ask"):
            return text({"error": f"role '{user['role']}' cannot ask questions"})
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        qid = f"q{len(f.qa) + 1}"
        asked_by = user["username"] if user["username"] != "anonymous" else arguments.get("asked_by", "anonymous")
        q = QnA(id=qid, question=arguments["question"], asked_by=asked_by, asked_at=now())
        f.qa.append(q)
        storage.save_feature(f)
        return text(q.model_dump(mode="json"))

    if name == "answer_question":
        if not _can(user["role"], "answer"):
            return text({"error": f"role '{user['role']}' cannot answer questions (need pa/lead/admin)"})
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        q = next((q for q in f.qa if q.id == arguments["question_id"]), None)
        if not q:
            return text({"error": f"Question '{arguments['question_id']}' not found"})
        answered_by = user["username"] if user["username"] != "anonymous" else arguments.get("answered_by", "anonymous")
        q.answer = arguments["answer"]
        q.answered_by = answered_by
        q.answered_at = now()
        q.status = "answered"
        storage.save_feature(f)

        # Master LLM hooks (best-effort, sync since MCP server has no BackgroundTasks)
        try:
            llm = get_master_llm()
            if llm.enabled:
                qa_items = [{"question": x.question, "answer": x.answer} for x in f.qa if x.status == "answered" and x.id != q.id]
                desc = llm.detect_conflict(
                    spec=f.spec.current,
                    qa_items=qa_items,
                    new_event={"type": "qa_answer", "content": f"Q: {q.question}\nA: {q.answer}"},
                )
                if desc:
                    cid = f"c{len(f.conflicts) + 1}"
                    f.conflicts.append(Conflict(
                        id=cid, description=desc, flagged_by="master_llm",
                        flagged_at=now(), auto_detected=True,
                    ))
                    storage.save_feature(f)
        except Exception as e:
            print(f"[mcp] master_llm hook failed: {e}", file=sys.stderr)

        return text(q.model_dump(mode="json"))

    if name == "get_pending_questions":
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        pending = [q.model_dump(mode="json") for q in f.qa if q.status == "pending"]
        return text(pending)

    if name == "flag_conflict":
        if not _can(user["role"], "flag"):
            return text({"error": f"role '{user['role']}' cannot flag conflicts"})
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        cid = f"c{len(f.conflicts) + 1}"
        flagged_by = user["username"] if user["username"] != "anonymous" else arguments.get("flagged_by", "anonymous")
        c = Conflict(id=cid, description=arguments["description"], flagged_by=flagged_by, flagged_at=now())
        f.conflicts.append(c)
        storage.save_feature(f)
        return text(c.model_dump(mode="json"))

    if name == "regenerate_summary":
        if not _can(user["role"], "summarize"):
            return text({"error": f"role '{user['role']}' cannot regenerate summaries (need pa/lead/admin)"})
        fid = arguments["feature_id"]
        f = storage.load_feature(fid)
        if not f:
            return text({"error": f"Feature '{fid}' not found"})
        llm = get_master_llm()
        if not llm.enabled:
            return text({"error": "Master LLM is disabled in config.json"})
        qa_items = [{"question": q.question, "answer": q.answer} for q in f.qa if q.status == "answered"]
        summary = llm.summarize_feature(spec=f.spec.current, qa_items=qa_items)
        if not summary:
            return text({"error": "summary generation failed"})
        f.knowledge_graph_summary = summary
        f.summary_generated_at = now()
        storage.save_feature(f)
        return text({"feature_id": f.id, "summary": summary, "generated_at": str(f.summary_generated_at)})

    return text({"error": f"Unknown tool: {name}"})


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
