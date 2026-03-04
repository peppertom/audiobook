from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, UserSettings, CreditBalance, CreditTransaction
from app.schemas import (
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    CreditBalanceResponse,
    CreditTransactionResponse,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(user: User = Depends(get_current_user)):
    """Get current user's profile."""
    return user


@router.get("/me/settings", response_model=UserSettingsResponse)
async def get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's settings."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        # Auto-create if missing (shouldn't happen, but defensive)
        settings = UserSettings(user_id=user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.put("/me/settings", response_model=UserSettingsResponse)
async def update_settings(
    update: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's settings (partial update)."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = UserSettings(user_id=user.id)
        db.add(settings)

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/me/credits", response_model=CreditBalanceResponse)
async def get_credits(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's credit balance."""
    result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user.id)
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        balance = CreditBalance(user_id=user.id, balance=0)
        db.add(balance)
        await db.commit()
        await db.refresh(balance)
    return balance


@router.get("/me/credits/history", response_model=list[CreditTransactionResponse])
async def get_credit_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Get current user's credit transaction history."""
    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()
