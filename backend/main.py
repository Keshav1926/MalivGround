from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import re

from .models import (
    Feature, Spec, SpecVersion, QnA, Conflict, User,
    CreateFeatureRequest, UpdateSpecRequest,
    AskQuestionRequest, AnswerQuestionRequest, FlagConflictRequest,
    ResolveConflictRequest, LoginRequest, RegisterRequest,
    CreateApiKeyRequest, ChangePasswordRequest,
)
from . import storage
from .master_llm import get_master_llm, load_config
from . import auth

app = FastAPI(title="Maliv-Ground", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    bootstrap = auth.bootstrap_admin_if_empty()
    if bootstrap:
        username, password = bootstrap
        print("=" * 60)
        print(f"🔐 Initial admin user created")
        print(f"   username: {username}")
        print(f"   password: {password}")
        print(f"   ⚠ Change this immediately via /auth/change-password")
        print("=" * 60)


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def now() -> datetime:
    return datetime.now(timezone.utc)


# --- Master LLM background tasks ---

SUMMARY_DEBOUNCE_SECONDS = 60


def _qa_dicts(feature: Feature) -> list[dict]:
    return [
        {"question": q.question, "answer": q.answer}
        for q in feature.qa if q.status == "answered"
    ]


def _bg_check_viability(feature_id: str):
    llm = get_master_llm()
    if not llm.enabled:
        return
    f = storage.load_feature(feature_id)
    if not f:
        return
    warnings = llm.check_spec_viability(f.spec.current)
    f.spec.viability_warnings = warnings
    f.spec.viability_checked_at = now()
    storage.save_feature(f)


def _bg_detect_conflict(feature_id: str, event_type: str, content: str):
    llm = get_master_llm()
    if not llm.enabled:
        return
    f = storage.load_feature(feature_id)
    if not f:
        return
    desc = llm.detect_conflict(
        spec=f.spec.current,
        qa_items=_qa_dicts(f),
        new_event={"type": event_type, "content": content},
    )
    if desc:
        cid = f"c{len(f.conflicts) + 1}"
        f.conflicts.append(Conflict(
            id=cid, description=desc, flagged_by="master_llm",
            flagged_at=now(), auto_detected=True,
        ))
        storage.save_feature(f)


def _bg_regenerate_summary(feature_id: str, force: bool = False):
    llm = get_master_llm()
    if not llm.enabled:
        return
    f = storage.load_feature(feature_id)
    if not f:
        return
    if not force and f.summary_generated_at:
        elapsed = (now() - f.summary_generated_at).total_seconds()
        if elapsed < SUMMARY_DEBOUNCE_SECONDS:
            return
    summary = llm.summarize_feature(spec=f.spec.current, qa_items=_qa_dicts(f))
    if summary:
        f.knowledge_graph_summary = summary
        f.summary_generated_at = now()
        storage.save_feature(f)


# --- Permission helpers ---

WRITE_ROLES = {"admin", "pa", "lead"}
ASK_ROLES = {"admin", "pa", "lead", "dev", "qa"}


def require_write(user: User = Depends(auth.get_current_user)) -> User:
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, f"Role '{user.role}' cannot perform this action (need pa/lead/admin)")
    return user


def require_ask(user: User = Depends(auth.get_current_user)) -> User:
    if user.role not in ASK_ROLES:
        raise HTTPException(403, f"Role '{user.role}' cannot ask")
    return user


# ============================================================
# AUTH ROUTES
# ============================================================

@app.post("/auth/login")
def login(req: LoginRequest):
    user = auth.authenticate(req.username, req.password)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    token = auth.issue_token(user)
    return {"token": token, "user": _user_public(user)}


@app.get("/auth/me")
def me(user: User = Depends(auth.get_current_user)):
    return _user_public(user)


@app.post("/auth/register", status_code=201)
def register(req: RegisterRequest, admin: User = Depends(auth.require_roles("admin"))):
    if req.role not in {"admin", "pa", "lead", "dev", "qa"}:
        raise HTTPException(400, "Invalid role")
    try:
        user = auth.create_user(req.username, req.password, req.role)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _user_public(user)


@app.post("/auth/change-password")
def change_password(req: ChangePasswordRequest, user: User = Depends(auth.get_current_user)):
    if not auth.verify_password(req.old_password, user.password_hash):
        raise HTTPException(401, "Old password incorrect")
    user.password_hash = auth.hash_password(req.new_password)
    storage.save_user(user)
    return {"status": "ok"}


@app.get("/auth/users")
def list_users(admin: User = Depends(auth.require_roles("admin"))):
    return [_user_public(u) for u in storage.list_users()]


@app.delete("/auth/users/{user_id}")
def delete_user(user_id: str, admin: User = Depends(auth.require_roles("admin"))):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    if not storage.delete_user(user_id):
        raise HTTPException(404, "User not found")
    return {"status": "ok"}


@app.post("/auth/api-keys", status_code=201)
def create_api_key(req: CreateApiKeyRequest, user: User = Depends(auth.get_current_user)):
    record, full_key = auth.add_api_key(user, req.label)
    # Full key shown ONCE
    return {
        "id": record.id,
        "label": record.label,
        "created_at": record.created_at,
        "key": full_key,
        "warning": "Store this key now — it will not be shown again.",
    }


@app.get("/auth/api-keys")
def list_api_keys(user: User = Depends(auth.get_current_user)):
    return [
        {"id": k.id, "label": k.label, "created_at": k.created_at, "last_used_at": k.last_used_at}
        for k in user.api_keys
    ]


@app.delete("/auth/api-keys/{key_id}")
def delete_api_key(key_id: str, user: User = Depends(auth.get_current_user)):
    if not auth.revoke_api_key(user, key_id):
        raise HTTPException(404, "Key not found")
    return {"status": "ok"}


def _user_public(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "created_at": user.created_at,
    }


# ============================================================
# FEATURE ROUTES (auth-gated)
# ============================================================

@app.get("/features")
def get_features(user: User = Depends(auth.get_current_user)):
    features = storage.list_features()
    return [
        {"id": f.id, "title": f.title, "status": f.status, "created_at": f.created_at}
        for f in features
    ]


@app.post("/features", status_code=201)
def create_feature(req: CreateFeatureRequest, bg: BackgroundTasks, user: User = Depends(require_write)):
    feature_id = slugify(req.title)
    if storage.load_feature(feature_id):
        raise HTTPException(400, f"Feature '{feature_id}' already exists")
    ts = now()
    feature = Feature(
        id=feature_id,
        title=req.title,
        created_by=user.username,
        created_at=ts,
        spec=Spec(
            current=req.spec_content,
            versions=[SpecVersion(content=req.spec_content, timestamp=ts, updated_by=user.username)],
        ),
        tags=req.tags,
    )
    storage.save_feature(feature)
    bg.add_task(_bg_check_viability, feature.id)
    bg.add_task(_bg_regenerate_summary, feature.id, True)
    return feature


@app.get("/features/{feature_id}")
def get_feature(feature_id: str, user: User = Depends(auth.get_current_user)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    return f


@app.put("/features/{feature_id}/spec")
def update_spec(feature_id: str, req: UpdateSpecRequest, bg: BackgroundTasks, user: User = Depends(require_write)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    ts = now()
    f.spec.versions.append(SpecVersion(content=f.spec.current, timestamp=ts, updated_by=user.username))
    f.spec.current = req.content
    storage.save_feature(f)
    bg.add_task(_bg_check_viability, f.id)
    bg.add_task(_bg_detect_conflict, f.id, "spec_update", req.content)
    bg.add_task(_bg_regenerate_summary, f.id)
    return f


# --- Q&A ---

@app.post("/features/{feature_id}/qa", status_code=201)
def ask_question(feature_id: str, req: AskQuestionRequest, user: User = Depends(require_ask)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    qid = f"q{len(f.qa) + 1}"
    q = QnA(id=qid, question=req.question, asked_by=user.username, asked_at=now())
    f.qa.append(q)
    storage.save_feature(f)
    return q


@app.put("/features/{feature_id}/qa/{question_id}/answer")
def answer_question(feature_id: str, question_id: str, req: AnswerQuestionRequest, bg: BackgroundTasks, user: User = Depends(require_write)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    q = next((q for q in f.qa if q.id == question_id), None)
    if not q:
        raise HTTPException(404, "Question not found")
    q.answer = req.answer
    q.answered_by = user.username
    q.answered_at = now()
    q.status = "answered"
    storage.save_feature(f)
    bg.add_task(_bg_detect_conflict, f.id, "qa_answer", f"Q: {q.question}\nA: {req.answer}")
    bg.add_task(_bg_regenerate_summary, f.id)
    return q


# --- Conflicts ---

@app.post("/features/{feature_id}/conflicts", status_code=201)
def flag_conflict(feature_id: str, req: FlagConflictRequest, user: User = Depends(require_ask)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    cid = f"c{len(f.conflicts) + 1}"
    c = Conflict(id=cid, description=req.description, flagged_by=user.username, flagged_at=now())
    f.conflicts.append(c)
    storage.save_feature(f)
    return c


@app.put("/features/{feature_id}/conflicts/{conflict_id}/resolve")
def resolve_conflict(feature_id: str, conflict_id: str, req: ResolveConflictRequest, user: User = Depends(require_write)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    c = next((c for c in f.conflicts if c.id == conflict_id), None)
    if not c:
        raise HTTPException(404, "Conflict not found")
    c.resolved = True
    c.resolution = req.resolution
    storage.save_feature(f)
    return c


# --- Master LLM endpoints ---

@app.post("/features/{feature_id}/recheck")
def recheck(feature_id: str, bg: BackgroundTasks, user: User = Depends(require_write)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    bg.add_task(_bg_check_viability, feature_id)
    bg.add_task(_bg_regenerate_summary, feature_id, True)
    return {"status": "queued", "feature_id": feature_id}


@app.post("/features/{feature_id}/summarize")
def summarize(feature_id: str, bg: BackgroundTasks, user: User = Depends(require_write)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")
    bg.add_task(_bg_regenerate_summary, feature_id, True)
    return {"status": "queued", "feature_id": feature_id}


@app.get("/system/status")
def system_status():
    cfg = load_config()
    llm_cfg = cfg.get("master_llm", {})
    return {
        "version": "0.2.0",
        "master_llm_enabled": llm_cfg.get("enabled", False),
        "provider": llm_cfg.get("provider") if llm_cfg.get("enabled") else None,
        "context_pull_mode": cfg.get("context_pull_mode", "full"),
    }


@app.get("/features/{feature_id}/context")
def get_context(feature_id: str, mode: str = "", user: User = Depends(auth.get_current_user)):
    f = storage.load_feature(feature_id)
    if not f:
        raise HTTPException(404, "Feature not found")

    cfg = load_config()
    effective_mode = mode or cfg.get("context_pull_mode", "full")

    if effective_mode == "summary" and f.knowledge_graph_summary:
        return {
            "feature_id": f.id,
            "title": f.title,
            "mode": "summary",
            "summary": f.knowledge_graph_summary,
            "summary_generated_at": f.summary_generated_at,
            "open_conflicts": [c for c in f.conflicts if not c.resolved],
        }

    answered_qa = [q for q in f.qa if q.status == "answered"]
    return {
        "feature_id": f.id,
        "title": f.title,
        "mode": "full",
        "spec": f.spec.current,
        "viability_warnings": f.spec.viability_warnings,
        "answered_qa": answered_qa,
        "open_conflicts": [c for c in f.conflicts if not c.resolved],
    }
