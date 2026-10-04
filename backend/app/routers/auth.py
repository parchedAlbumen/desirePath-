from fastapi import APIRouter, Depends, HTTPException
from psycopg import errors

from app.auth import create_token, get_current_user_id, hash_password, verify_password
from app.db import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, conn=Depends(get_db)):
    """Creates an account and logs it in straight away."""
    try:
        user = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id, email",
            (body.email.lower(), hash_password(body.password)),
        ).fetchone()
    except errors.UniqueViolation:  # users.email is UNIQUE in the DB
        raise HTTPException(409, "An account with that email already exists")
    return {"access_token": create_token(user["id"]), "user": user}


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, conn=Depends(get_db)):
    user = conn.execute("SELECT * FROM users WHERE email = %s", (body.email.lower(),)).fetchone()
    # Same message either way, so login can't be used to check which emails have accounts
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return {"access_token": create_token(user["id"]), "user": user}


@router.delete("/me", status_code=204)
def delete_account(user_id: int = Depends(get_current_user_id), conn=Depends(get_db)):
    """Deletes the logged-in user. Their routes and points go too (ON DELETE CASCADE)."""
    if conn.execute("DELETE FROM users WHERE id = %s", (user_id,)).rowcount == 0:
        raise HTTPException(404, "Account not found")
