"""Seed or promote an admin user.

Usage:
  AUDIOBOOK_DATABASE_URL=... python scripts/seed_admin.py admin@example.com
"""

import asyncio
import sys

from sqlalchemy import select

from app.database import async_session
from app.models import User


async def main(email: str) -> None:
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            raise SystemExit(f"User not found: {email}")

        user.is_admin = True
        user.is_approved = True
        await session.commit()
        print(f"Admin privileges granted: {email}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/seed_admin.py <email>")
    asyncio.run(main(sys.argv[1]))
