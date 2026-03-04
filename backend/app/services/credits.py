import math
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CreditBalance, CreditTransaction

WORDS_PER_CREDIT = 10_000  # 1 credit ≈ 10,000 words ≈ 1 chapter


def calculate_credits_needed(total_words: int) -> int:
    """Calculate credits needed for a given word count. Minimum 1 credit."""
    if total_words <= 0:
        return 0
    return max(1, math.ceil(total_words / WORDS_PER_CREDIT))


async def get_balance(db: AsyncSession, user_id: str) -> int:
    """Get user's current credit balance."""
    result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        return 0
    return balance.balance


async def spend_credits(
    db: AsyncSession,
    user_id: str,
    amount: int,
    description: str,
    reference_id: str | None = None,
) -> bool:
    """Spend credits from user's balance. Returns False if insufficient."""
    result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()

    if balance is None or balance.balance < amount:
        return False

    balance.balance -= amount

    db.add(CreditTransaction(
        user_id=user_id,
        amount=-amount,
        type="conversion_spend",
        description=description,
        reference_id=reference_id,
    ))

    await db.commit()
    return True


async def grant_credits(
    db: AsyncSession,
    user_id: str,
    amount: int,
    type: str,
    description: str,
    reference_id: str | None = None,
) -> None:
    """Grant credits to user's balance."""
    result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()

    if balance is None:
        balance = CreditBalance(user_id=user_id, balance=0)
        db.add(balance)

    balance.balance += amount

    db.add(CreditTransaction(
        user_id=user_id,
        amount=amount,
        type=type,
        description=description,
        reference_id=reference_id,
    ))

    await db.commit()


async def check_purchase_exists(
    db: AsyncSession,
    user_id: str,
    book_id: int,
    voice_id: int,
) -> bool:
    """Check if user already paid for this book+voice conversion."""
    reference = f"book:{book_id}:voice:{voice_id}"
    result = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.user_id == user_id,
            CreditTransaction.type == "conversion_spend",
            CreditTransaction.reference_id == reference,
        )
    )
    return result.scalar_one_or_none() is not None
