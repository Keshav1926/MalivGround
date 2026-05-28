from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SpecVersion(BaseModel):
    content: str
    timestamp: datetime
    updated_by: str


class Spec(BaseModel):
    current: str
    versions: list[SpecVersion] = []
    viability_warnings: list[str] = []
    viability_checked_at: Optional[datetime] = None


class QnA(BaseModel):
    id: str
    question: str
    asked_by: str
    asked_at: datetime
    answer: Optional[str] = None
    answered_by: Optional[str] = None
    answered_at: Optional[datetime] = None
    status: str = "pending"


class Conflict(BaseModel):
    id: str
    description: str
    flagged_by: str
    flagged_at: datetime
    resolved: bool = False
    resolution: Optional[str] = None
    auto_detected: bool = False


class Feature(BaseModel):
    id: str
    title: str
    created_by: str
    created_at: datetime
    spec: Spec
    qa: list[QnA] = []
    conflicts: list[Conflict] = []
    knowledge_graph_summary: Optional[str] = None
    summary_generated_at: Optional[datetime] = None
    tags: list[str] = []
    status: str = "active"


# --- Auth models ---

class ApiKey(BaseModel):
    id: str
    key_hash: str
    label: str
    created_at: datetime
    last_used_at: Optional[datetime] = None


class User(BaseModel):
    id: str
    username: str
    password_hash: str
    role: str  # "admin" | "pa" | "lead" | "dev" | "qa"
    api_keys: list[ApiKey] = []
    created_at: datetime


# --- Request bodies ---

class CreateFeatureRequest(BaseModel):
    title: str
    spec_content: str
    created_by: Optional[str] = None  # derived from auth in Phase 3
    tags: list[str] = []


class UpdateSpecRequest(BaseModel):
    content: str
    updated_by: Optional[str] = None


class AskQuestionRequest(BaseModel):
    question: str
    asked_by: Optional[str] = None


class AnswerQuestionRequest(BaseModel):
    answer: str
    answered_by: Optional[str] = None


class FlagConflictRequest(BaseModel):
    description: str
    flagged_by: Optional[str] = None


class ResolveConflictRequest(BaseModel):
    resolution: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str


class CreateApiKeyRequest(BaseModel):
    label: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
