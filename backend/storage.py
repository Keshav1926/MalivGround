import json
import hashlib
from pathlib import Path
from typing import Optional
from .models import Feature, User

STORAGE_DIR = Path(__file__).parent / "storage" / "features"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

USERS_PATH = Path(__file__).parent / "storage" / "users.json"


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


def list_features() -> list[Feature]:
    features = []
    for p in STORAGE_DIR.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            features.append(Feature(**data))
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
