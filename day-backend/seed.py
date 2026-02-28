"""Seed script — creates a demo company + admin user for development."""

import asyncio
import uuid

from sqlalchemy import select

from app.infrastructure.database import async_session
from app.infrastructure.models.auth import CompanyModel, UserModel
from app.infrastructure.security import hash_password

SEED_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
SEED_USER_EMAIL = "admin@day.kz"
SEED_USER_PASSWORD = "password"


async def seed() -> None:
    async with async_session() as session:
        # Ensure company exists
        company = await session.get(CompanyModel, SEED_COMPANY_ID)
        if not company:
            company = CompanyModel(id=SEED_COMPANY_ID, name="Default Company")
            session.add(company)
            await session.flush()
            print(f"Created company: {company.name}")
        else:
            print(f"Company already exists: {company.name}")

        # Ensure admin user exists
        stmt = select(UserModel).where(UserModel.email == SEED_USER_EMAIL)
        existing_user = await session.scalar(stmt)
        if not existing_user:
            user = UserModel(
                id=uuid.uuid4(),
                email=SEED_USER_EMAIL,
                hashed_password=hash_password(SEED_USER_PASSWORD),
                company_id=SEED_COMPANY_ID,
                role="owner",
                is_active=True,
            )
            session.add(user)
            print(f"Created user: {SEED_USER_EMAIL} / {SEED_USER_PASSWORD}")
        else:
            print(f"User already exists: {SEED_USER_EMAIL}")

        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
