from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(LoginRequest):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8, max_length=72)  # bcrypt only uses the first 72 bytes


class User(BaseModel):
    id: int
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User
