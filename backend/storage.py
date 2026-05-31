import json
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from .models import Feature, User, Project, SpecFile

STORAGE_DIR = Path(__file__).parent / "storage" / "features"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

PROJECTS_DIR = Path(__file__).parent / "storage" / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

SPEC_FILES_DIR = Path(__file__).parent / "storage" / "spec_files"
SPEC_FILES_DIR.mkdir(parents=True, exist_ok=True)

USERS_PATH = Path(__file__).parent / "storage" / "users.json"


# --- Filename sanitization ---

def sanitize_filename(name: str) -> str:
    """Strict sanitization: no path separators, force .md extension, slug-friendly."""
    name = name.strip().replace("\\", "/").split("/")[-1]  # strip any path
    name = name.replace("..", "")
    base, ext = name.rsplit(".", 1) if "." in name else (name, "")
    if ext.lower() not in ("md", "markdown"):
        raise ValueError("only .md or .markdown files allowed")
    base = re.sub(r"[^\w\-]", "-", base).strip("-").lower()
    if not base:
        raise ValueError("invalid filename")
    return f"{base}.md"


# --- Features ---

def _feature_path(feature_id: str) -> Path:
    return STORAGE_DIR / f"{feature_id}.json"


def save_feature(feature: Feature) -> None:
    path = _feature_path(feature.id)
    path.write_text(
        json.dumps(feature.model_dump(mode="json"), indent=2),
        encoding="utf-8"
    )


def load_feature(feature_id: str) -> Optional[Feature]:
    path = _feature_path(feature_id)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return Feature(**data)


def list_features(project_id: Optional[str] = None) -> list[Feature]:
    features = []
    for p in STORAGE_DIR.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            f = Feature(**data)
            if project_id and f.project_id != project_id:
                continue
            features.append(f)
        except Exception:
            continue
    return sorted(features, key=lambda f: f.created_at, reverse=True)


def delete_feature(feature_id: str) -> bool:
    path = _feature_path(feature_id)
    if path.exists():
        path.unlink()
        return True
    return False


# --- Users ---

def _load_users_raw() -> list[dict]:
    if not USERS_PATH.exists():
        return []
    try:
        return json.loads(USERS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_users_raw(users: list[dict]) -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    USERS_PATH.write_text(json.dumps(users, indent=2), encoding="utf-8")


def list_users() -> list[User]:
    return [User(**u) for u in _load_users_raw()]


def save_user(user: User) -> None:
    raw = _load_users_raw()
    new_data = user.model_dump(mode="json")
    for i, u in enumerate(raw):
        if u.get("id") == user.id:
            raw[i] = new_data
            _save_users_raw(raw)
            return
    raw.append(new_data)
    _save_users_raw(raw)


def find_user_by_username(username: str) -> Optional[User]:
    for u in _load_users_raw():
        if u.get("username") == username:
            return User(**u)
    return None


def find_user_by_id(user_id: str) -> Optional[User]:
    for u in _load_users_raw():
        if u.get("id") == user_id:
            return User(**u)
    return None


def find_user_by_api_key(api_key: str) -> Optional[User]:
    if not api_key:
        return None
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    for u in _load_users_raw():
        for k in u.get("api_keys", []):
            if k.get("key_hash") == key_hash:
                return User(**u)
    return None


def delete_user(user_id: str) -> bool:
    raw = _load_users_raw()
    new_raw = [u for u in raw if u.get("id") != user_id]
    if len(new_raw) < len(raw):
        _save_users_raw(new_raw)
        return True
    return False


# --- Projects ---

def _project_path(project_id: str) -> Path:
    return PROJECTS_DIR / f"{project_id}.json"


def save_project(project: Project) -> None:
    _project_path(project.id).write_text(
        json.dumps(project.model_dump(mode="json"), indent=2), encoding="utf-8"
    )


def load_project(project_id: str) -> Optional[Project]:
    path = _project_path(project_id)
    if not path.exists():
        return None
    return Project(**json.loads(path.read_text(encoding="utf-8")))


def list_projects() -> list[Project]:
    out = []
    for p in PROJECTS_DIR.glob("*.json"):
        try:
            out.append(Project(**json.loads(p.read_text(encoding="utf-8"))))
        except Exception:
            continue
    return sorted(out, key=lambda p: p.created_at, reverse=True)


def delete_project(project_id: str) -> bool:
    path = _project_path(project_id)
    if path.exists():
        path.unlink()
        return True
    return False


# --- Spec files (markdown attachments) ---

MAX_SPEC_FILE_BYTES = 1024 * 1024  # 1MB


def _spec_dir(feature_id: str) -> Path:
    d = SPEC_FILES_DIR / feature_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_spec_file(feature_id: str, filename: str, content: bytes, uploaded_by: str) -> SpecFile:
    safe = sanitize_filename(filename)
    if len(content) > MAX_SPEC_FILE_BYTES:
        raise ValueError(f"file exceeds {MAX_SPEC_FILE_BYTES} bytes")
    path = _spec_dir(feature_id) / safe
    path.write_bytes(content)
    return SpecFile(
        filename=safe,
        uploaded_by=uploaded_by,
        uploaded_at=datetime.now(timezone.utc),
        size_bytes=len(content),
    )


def load_spec_file(feature_id: str, filename: str) -> Optional[str]:
    try:
        safe = sanitize_filename(filename)
    except Exception:
        return None
    path = _spec_dir(feature_id) / safe
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def delete_spec_file(feature_id: str, filename: str) -> bool:
    try:
        safe = sanitize_filename(filename)
    except Exception:
        return False
    path = _spec_dir(feature_id) / safe
    if path.exists():
        path.unlink()
        return True
    return False
