from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.cleaning.entities import CleanerRating
from app.domain.cleaning.repositories import CleanerRatingRepository, CleaningTaskRepository


@dataclass
class RateCleanerInput:
    company_id: uuid.UUID
    cleaner_id: uuid.UUID
    score: int
    task_id: uuid.UUID | None = None
    rated_by: uuid.UUID | None = None
    review: str | None = None


class RateCleanerService:
    def __init__(
        self,
        rating_repo: CleanerRatingRepository,
        task_repo: CleaningTaskRepository,
    ) -> None:
        self._rating_repo = rating_repo
        self._task_repo = task_repo

    async def execute(self, inp: RateCleanerInput) -> CleanerRating:
        if inp.score < 1 or inp.score > 5:
            raise ValueError("Score must be between 1 and 5")

        if inp.task_id:
            task = await self._task_repo.get_by_id(inp.task_id)
            if task is None:
                raise ValueError("Cleaning task not found")
            if task.company_id != inp.company_id:
                raise ValueError("Task does not belong to company")

        return await self._rating_repo.create(
            CleanerRating(
                company_id=inp.company_id,
                cleaner_id=inp.cleaner_id,
                task_id=inp.task_id,
                rated_by=inp.rated_by,
                score=inp.score,
                review=inp.review,
            )
        )

    async def get_kpi(self, cleaner_id: uuid.UUID) -> dict:
        avg_score = await self._rating_repo.avg_score_by_cleaner(cleaner_id)
        total_ratings = await self._rating_repo.count_by_cleaner(cleaner_id)
        ratings = await self._rating_repo.list_by_cleaner(cleaner_id, limit=10)
        return {
            "cleaner_id": str(cleaner_id),
            "avg_score": round(avg_score, 2),
            "total_ratings": total_ratings,
            "recent_ratings": [
                {
                    "id": str(r.id),
                    "score": r.score,
                    "review": r.review,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in ratings
            ],
        }
