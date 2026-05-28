"""Master LLM layer — optional intelligence layer for spec viability,
conflict detection, and knowledge graph summarization.

Provider-agnostic: anthropic, openai, gemini, openai-compatible (Ollama, LM Studio, vLLM).
All public methods MUST be safe to fail — callers wrap in try/except, but we
also return sentinel values on parse errors so background tasks never crash.
"""

from __future__ import annotations
import json
import os
import re
from pathlib import Path
from typing import Optional, Any

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"master_llm": {"enabled": False}, "context_pull_mode": "full"}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


# --- Prompt templates ---

VIABILITY_SYSTEM = """You are a spec reviewer for a software team's shared context store.
Your job: read a feature spec and flag concrete ambiguities that would cause an AI coding agent to produce wrong code.

Return ONLY a JSON array of warning strings. Each warning must be:
- Concrete and actionable (not generic advice)
- About a real ambiguity in THIS spec (not boilerplate)
- One short sentence

If the spec is clear, return [].

Examples of good warnings:
- "No acceptance criteria defined — what does 'working' mean?"
- "User role unclear — does this affect admins, regular users, or both?"
- "Error handling not specified for the case when the API is unreachable"

Examples of bad warnings (DO NOT return these):
- "Consider adding more details" (vague)
- "Specs should be detailed" (boilerplate)
"""

VIABILITY_USER = """Spec:
---
{spec}
---

Return ONLY a JSON array. No prose, no markdown fences."""


CONFLICT_SYSTEM = """You are a conflict detector for a software spec store.
Your job: determine if a NEW event (spec update or Q&A answer) contradicts the EXISTING spec or earlier answered Q&A.

Return ONLY a JSON object: {"conflict": true, "description": "..."} or {"conflict": false}.

A conflict is a direct contradiction of a stated decision or constraint.
Mere additions, refinements, or clarifications are NOT conflicts.
"""

CONFLICT_USER = """EXISTING SPEC:
---
{spec}
---

EARLIER ANSWERED Q&A:
{qa_block}

NEW EVENT ({event_type}):
---
{new_content}
---

Return ONLY the JSON object."""


SUMMARY_SYSTEM = """You are a knowledge compressor for software specs.
Compress the given spec + answered Q&A into a single dense summary capturing all decisions and constraints.
- Focus on decisions, not chronology
- Preserve every constraint, edge case, and stated requirement
- 200-400 words
- Plain prose, no headings or bullets unless the original had structure worth preserving
"""

SUMMARY_USER = """SPEC:
---
{spec}
---

ANSWERED Q&A:
{qa_block}

Produce the summary."""


# --- Provider abstraction ---

class MasterLLM:
    def __init__(self, config: Optional[dict] = None):
        cfg = config or load_config()
        self.cfg = cfg.get("master_llm", {})
        self.enabled = self.cfg.get("enabled", False)
        self.provider = self.cfg.get("provider", "anthropic")
        self.model = self.cfg.get("model", "")
        self.api_key_env = self.cfg.get("api_key_env", "")
        self.base_url = self.cfg.get("base_url")
        self._client = None

    def _client_lazy(self):
        if self._client is not None:
            return self._client
        api_key = os.environ.get(self.api_key_env, "") if self.api_key_env else ""

        if self.provider == "anthropic":
            from anthropic import Anthropic
            self._client = Anthropic(api_key=api_key) if api_key else Anthropic()
        elif self.provider == "openai":
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key) if api_key else OpenAI()
        elif self.provider == "openai-compatible":
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key or "not-needed", base_url=self.base_url)
        elif self.provider == "gemini":
            import google.generativeai as genai
            if api_key:
                genai.configure(api_key=api_key)
            self._client = genai
        else:
            raise ValueError(f"Unknown provider: {self.provider}")
        return self._client

    def complete(self, system: str, user: str, max_tokens: int = 1024) -> str:
        """Returns the raw text completion from the configured provider."""
        client = self._client_lazy()

        if self.provider == "anthropic":
            resp = client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return resp.content[0].text

        elif self.provider in ("openai", "openai-compatible"):
            resp = client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return resp.choices[0].message.content

        elif self.provider == "gemini":
            model = client.GenerativeModel(self.model, system_instruction=system)
            resp = model.generate_content(user)
            return resp.text

        raise ValueError(f"Unknown provider: {self.provider}")

    # --- High-level functions ---

    def check_spec_viability(self, spec_text: str) -> list[str]:
        if not self.enabled or not spec_text.strip():
            return []
        try:
            raw = self.complete(VIABILITY_SYSTEM, VIABILITY_USER.format(spec=spec_text), max_tokens=512)
            parsed = _extract_json(raw)
            if isinstance(parsed, list):
                return [str(w).strip() for w in parsed if str(w).strip()]
            return []
        except Exception as e:
            print(f"[master_llm] viability check failed: {e}")
            return []

    def detect_conflict(self, spec: str, qa_items: list[dict], new_event: dict) -> Optional[str]:
        """qa_items: list of {question, answer} dicts. new_event: {type, content}."""
        if not self.enabled:
            return None
        try:
            qa_block = "\n".join(
                f"Q: {q['question']}\nA: {q['answer']}" for q in qa_items if q.get("answer")
            ) or "(none)"
            raw = self.complete(
                CONFLICT_SYSTEM,
                CONFLICT_USER.format(
                    spec=spec or "(empty)",
                    qa_block=qa_block,
                    event_type=new_event.get("type", "unknown"),
                    new_content=new_event.get("content", ""),
                ),
                max_tokens=512,
            )
            parsed = _extract_json(raw)
            if isinstance(parsed, dict) and parsed.get("conflict"):
                return str(parsed.get("description", "")).strip() or None
            return None
        except Exception as e:
            print(f"[master_llm] conflict detection failed: {e}")
            return None

    def summarize_feature(self, spec: str, qa_items: list[dict]) -> Optional[str]:
        if not self.enabled:
            return None
        try:
            qa_block = "\n".join(
                f"Q: {q['question']}\nA: {q['answer']}" for q in qa_items if q.get("answer")
            ) or "(none)"
            raw = self.complete(
                SUMMARY_SYSTEM,
                SUMMARY_USER.format(spec=spec or "(empty)", qa_block=qa_block),
                max_tokens=1024,
            )
            return raw.strip()
        except Exception as e:
            print(f"[master_llm] summarization failed: {e}")
            return None


def _extract_json(text: str) -> Any:
    """Extract a JSON value from LLM output, tolerating markdown fences and prose."""
    if not text:
        return None
    text = text.strip()
    # Strip markdown fences
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Try to find first balanced JSON object/array
    for opener, closer in [("{", "}"), ("[", "]")]:
        start = text.find(opener)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(text)):
            if text[i] == opener:
                depth += 1
            elif text[i] == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except Exception:
                        break
    return None


# Singleton accessor — re-reads config on every call so config edits take effect
def get_master_llm() -> MasterLLM:
    return MasterLLM()
