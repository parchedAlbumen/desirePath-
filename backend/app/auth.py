from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import JWT_SECRET

ALGORITHM = "HS256"  # sign tokens with JWT_SECRET (HMAC + SHA-256)
TOKEN_LIFETIME = timedelta(days=7)

# Reads the "Authorization: Bearer <token>" header. Also adds the Authorize button to /docs.
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + TOKEN_LIFETIME}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def get_current_user_id(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> int:
    if creds is None:
        raise HTTPException(401, "Not logged in")
    try:
        # Checks the signature and the expiry; raises if either is bad
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return int(payload["sub"])
