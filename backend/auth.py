"""Auth layer — bcrypt password hashing, JWT sessions, API keys.
Self-hosted style: a local secret persisted to disk on first run, no external IdP."""

from __future__ import annotations
import os
import secrets
import hashlib
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import jwt
import bcrypt
from fastapi import Depends, HTTPException, Request

from . import storage
from .models import User, ApiKey

JWT_ALGO = "HS256"
JWT_TTL = timedelta(days=7)
SECRET_PATH = Path(__file__).resolve().parent / "storage" / ".secret"


def _load_or_create_secret() -> str:
    SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        return SECRET_PATH.read_text(encoding="utf-8").strip()
    secret = secrets.token_hex(32)
    SECRET_PATH.write_text(secret, encoding="utf-8")
    try:
        os.chmod(SECRET_PATH, 0o600)
    except Exception:
        pass
    return secret


JWT_SECRET = _load_or_create_secret()


def now() -> datetime:
    return datetime.now(timezone.utc)


# --- Password helpers (bcrypt has a 72-byte limit; truncate by hashing first) ---

def _normalize(pw: str) -> bytes:
    """Pre-hash with SHA-256 so passwords > 72 bytes still work, then base64-ish."""
    pw_bytes = pw.encode("utf-8")
    if len(pw_bytes) > 72:
        pw_bytes = hashlib.sha256(pw_bytes).digest()
    return pw_bytes


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_normalize(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_normalize(plain), hashed.encode("utf-8"))
    except Exception:
        return False


# --- JWT helpers ---

def issue_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "iat": int(now().timestamp()),
        "exp": int((now() + JWT_TTL).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return None


# --- API key helpers ---

def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, key_id, key_hash). Full key shown to user once."""
    key_id = secrets.token_hex(4)  # 8-char id
    secret_part = secrets.token_urlsafe(32)
    full = f"mlv_{key_id}_{secret_part}"
    return full, key_id, hash_api_key(full)


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


# --- User CRUD ---

def create_user(username: str, password: str, role: str) -> User:
    if storage.find_user_by_username(username):
        raise ValueError(f"User '{username}' already exists")
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=hash_password(password),
        role=role,
        api_keys=[],
        created_at=now(),
    )
    storage.save_user(user)
    return user


def authenticate(username: str, password: str) -> Optional[User]:
    user = storage.find_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def add_api_key(user: User, label: str) -> tuple[ApiKey, str]:
    """Returns (ApiKey record, full_key string). Full key is only returned once."""
    full, key_id, key_hash = generate_api_key()
    record = ApiKey(
        id=key_id,
        key_hash=key_hash,
        label=label,
        created_at=now(),
    )
    user.api_keys.append(record)
    storage.save_user(user)
    return record, full


def revoke_api_key(user: User, key_id: str) -> bool:
    before = len(user.api_keys)
    user.api_keys = [k for k in user.api_keys if k.id != key_id]
    if len(user.api_keys) < before:
        storage.save_user(user)
        return True
    return False


# --- Bootstrap ---

def bootstrap_admin_if_empty() -> Optional[tuple[str, str]]:
    """If no users exist, create an admin with a random password.
    Returns (username, password) so caller can print it once."""
    users = storage.list_users()
    if users:
        return None
    password = secrets.token_urlsafe(16)
    create_user("admin", password, "admin")
    return ("admin", password)


# --- FastAPI dependency ---

def get_current_user(request: Request) -> User:
    """Resolve user from either Bearer JWT or X-API-Key header. Raises 401 if neither works."""
    # 1. Authorization: Bearer <jwt>
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:]
        payload = decode_token(token)
        if payload:
            user = storage.find_user_by_id(payload.get("sub"))
            if user:
                return user

    # 2. X-API-Key
    api_key = request.headers.get("x-api-key", "")
    if api_key:
        user = storage.find_user_by_api_key(api_key)
        if user:
            # Update last_used_at
            for k in user.api_keys:
                if k.key_hash == hash_api_key(api_key):
                    k.last_used_at = now()
                    storage.save_user(user)
                    break
            return user

    raise HTTPException(status_code=401, detail="Authentication required")


def require_roles(*roles: str):
    """FastAPI dependency factory for role-gated endpoints."""
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' not allowed. Required: {', '.join(roles)}",
            )
        return user
    return checker


def get_optional_user(request: Request) -> Optional[User]:
    """Like get_current_user but returns None instead of raising. Used for endpoints
    that work both authed and unauthed during the migration period."""
    try:
        return get_current_user(request)
    except HTTPException:
        return None
