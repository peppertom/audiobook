from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User, UserSettings, CreditBalance, CreditTransaction

# auto_error=False: does NOT return 401 when no token is present
security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Extract user from JWT token. Returns None if no token provided.

    Auto-creates user on first API call (with settings + free credits).
    Use this for endpoints that work with or without auth.
    """
    if credentials is None:
        return None

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: str | None = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing email claim",
        )

    # Look up existing user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-create user on first authenticated API call
        user = User(
            email=email,
            name=payload.get("name"),
            avatar_url=payload.get("picture"),
        )
        db.add(user)
        await db.flush()

        # Create default settings
        db.add(UserSettings(user_id=user.id))

        # Grant free signup credits
        db.add(CreditBalance(user_id=user.id, balance=settings.free_signup_credits))
        db.add(CreditTransaction(
            user_id=user.id,
            amount=settings.free_signup_credits,
            type="signup_bonus",
            description=f"Welcome bonus: {settings.free_signup_credits} free credits",
        ))

        await db.commit()
        await db.refresh(user)
    else:
        # Update name/avatar if changed on OAuth provider side
        changed = False
        if payload.get("name") and payload["name"] != user.name:
            user.name = payload["name"]
            changed = True
        if payload.get("picture") and payload["picture"] != user.avatar_url:
            user.avatar_url = payload["picture"]
            changed = True
        if changed:
            await db.commit()
            await db.refresh(user)

    return user


async def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    """Require authenticated user. Returns 401 if no valid token."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
