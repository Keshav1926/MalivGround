# Maliv-Ground

> "GitLab for context and ground truth"

A self-hostable, MCP-native shared context store for dev teams. Prevents the "Chinese Whispers" problem in AI-assisted development — PA specs, team Q&A, and decisions flow directly into your AI coding agents.

**v0.2 highlights:**
- 🤖 **Master LLM layer** — auto-flags ambiguous specs and detects contradictions in Q&A
- 📦 **Knowledge graph summary** — token-efficient context for AI agents
- 🔐 **Multi-user auth + API keys** — real accounts, role-based permissions, MCP keys

---

## Quick Start

### 1. Backend

```bash
cd CC/DD
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

On first run, the server will print an auto-generated admin password to stdout:

```
============================================================
🔐 Initial admin user created
   username: admin
   password: <random-string>
   ⚠ Change this immediately via /auth/change-password
============================================================
```

Save it. Sign in to the web UI and change it from the Settings panel.

API: `http://localhost:8000` · OpenAPI docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd CC/DD/frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

### 3. MCP Server (Claude Code, Cursor, Codex CLI, Gemini CLI)

```bash
claude mcp add maliv-ground \
  "/path/to/CC/DD/.venv/bin/python" \
  -s user \
  -- "/path/to/CC/DD/backend/mcp_server.py"
```

To authenticate the MCP client as a real user, generate an API key in the web UI (Settings → API Keys), then add it to the env:

```json
{
  "mcpServers": {
    "maliv-ground": {
      "command": "/path/to/.venv/bin/python",
      "args": ["/path/to/CC/DD/backend/mcp_server.py"],
      "env": { "MALIV_API_KEY": "mlv_xxx_xxx..." }
    }
  }
}
```

---

## Configuration (`config.json`)

```json
{
  "master_llm": {
    "enabled": true,
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929",
    "api_key_env": "ANTHROPIC_API_KEY",
    "base_url": null
  },
  "context_pull_mode": "full"
}
```

### Master LLM providers
- `anthropic` — set `ANTHROPIC_API_KEY` env var
- `openai` — set `OPENAI_API_KEY` env var
- `gemini` — set `GOOGLE_API_KEY` (or your env var name)
- `openai-compatible` — for Ollama/LM Studio/vLLM, set `base_url` (e.g. `http://localhost:11434/v1`)

### Context pull modes
- `full` — full spec + answered Q&A (default)
- `summary` — compressed knowledge-graph view (requires Master LLM)

When disabled, Maliv-Ground works exactly as v0.1 — the LLM features simply do nothing.

---

## Roles & Permissions

| Action | admin | pa | lead | dev | qa |
|---|---|---|---|---|---|
| Create feature | ✓ | ✓ | ✓ | – | – |
| Edit spec | ✓ | ✓ | ✓ | – | – |
| Answer question | ✓ | ✓ | ✓ | – | – |
| Resolve conflict | ✓ | ✓ | ✓ | – | – |
| Regenerate summary | ✓ | ✓ | ✓ | – | – |
| Ask question | ✓ | ✓ | ✓ | ✓ | ✓ |
| Flag conflict | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage users | ✓ | – | – | – | – |

Admins create users via `POST /auth/register` or the API docs.

---

## MCP Tools

| Tool | Description | Required Role |
|---|---|---|
| `list_features` | List all features | any |
| `get_feature_context(feature_id, mode?)` | Spec + answered Q&A. `mode="summary"` for compressed | any |
| `ask_question(feature_id, question, asked_by?)` | Post a doubt | any |
| `answer_question(feature_id, question_id, answer)` | Answer a question | pa/lead/admin |
| `get_pending_questions(feature_id)` | List unanswered questions | any |
| `flag_conflict(feature_id, description)` | Flag a contradiction | any |
| `regenerate_summary(feature_id)` | Force-regenerate KG summary | pa/lead/admin |
| `whoami` | Show authenticated user | any |

---

## REST API

```
# Auth
POST   /auth/login                    # → { token, user }
POST   /auth/register                 # admin-only
GET    /auth/me                       # current user
POST   /auth/change-password
GET    /auth/users                    # admin-only
DELETE /auth/users/{id}               # admin-only
POST   /auth/api-keys                 # → full key (shown once)
GET    /auth/api-keys                 # list (no full key)
DELETE /auth/api-keys/{id}

# Features
GET    /features
POST   /features
GET    /features/{id}
PUT    /features/{id}/spec
GET    /features/{id}/context?mode=full|summary

# Q&A
POST   /features/{id}/qa
PUT    /features/{id}/qa/{qid}/answer

# Conflicts
POST   /features/{id}/conflicts
PUT    /features/{id}/conflicts/{cid}/resolve

# Master LLM
POST   /features/{id}/recheck         # re-run viability + summary
POST   /features/{id}/summarize       # force-regen summary
GET    /system/status                 # system flags
```

All `/features/*` endpoints require `Authorization: Bearer <jwt>` or `X-API-Key: <key>`.

---

## Storage

- Features: `backend/storage/features/{feature-id}.json`
- Users: `backend/storage/users.json`
- JWT secret: `backend/storage/.secret` (auto-generated, keep private)

All files human-readable. You can version `features/` in Git alongside your codebase.

---

## Architecture

```
CC/DD/
├── backend/
│   ├── main.py            # FastAPI REST API
│   ├── mcp_server.py      # MCP server (stdio)
│   ├── models.py          # Pydantic schemas
│   ├── storage.py         # JSON file CRUD (features + users)
│   ├── auth.py            # bcrypt + JWT + API keys
│   ├── master_llm.py      # Provider-agnostic LLM layer
│   └── storage/
│       ├── features/
│       ├── users.json
│       └── .secret
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js         # auth-aware fetch wrapper
│       └── components/
│           ├── LoginPage.jsx
│           ├── UserMenu.jsx
│           ├── SettingsPanel.jsx (API keys + password)
│           ├── FeatureList.jsx
│           ├── SpecEditor.jsx
│           ├── QnAThread.jsx
│           ├── ConflictsView.jsx
│           └── SummaryView.jsx
├── config.json
└── mcp.json
```

---

## What's not in v0.2

- Password reset flow (admin manually resets via DB edit)
- Self-registration (admin invites only)
- Tags + sidebar filtering
- Role-based notifications (email/webhook)
- Git-sync for context store
