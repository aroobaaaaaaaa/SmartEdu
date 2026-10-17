# app/schemas/auth.py
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: int
    email: Optional[str] = None


class AdminCreateUser(BaseModel):
    email: EmailStr
    full_name: str
    role: str  # "teacher" or "student"
    registration_number: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("teacher", "student"):
            raise ValueError("Role must be 'teacher' or 'student'")
        return v

    @field_validator("registration_number")
    @classmethod
    def validate_registration_number(cls, v, info):
        """
        Registration number is mandatory for students, forbidden for teachers.
        We check the role from the same payload via info.data.
        """
        role = info.data.get("role")
        if role == "student":
            if not v or not v.strip():
                raise ValueError("Registration number is required for student accounts")
            return v.strip()
        if role == "teacher":
            if v:
                raise ValueError("Teachers do not have a registration number")
            return None
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()