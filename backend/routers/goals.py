from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.nutrition_goal import NutritionGoal

router = APIRouter()

DEFAULT_GOALS = {
    "daniel": {"calories": 2000.0, "protein": 150.0, "carbs": 250.0, "fat": 65.0, "fiber": 30.0},
    "thirza": {"calories": 1800.0, "protein": 120.0, "carbs": 220.0, "fat": 60.0, "fiber": 25.0},
}


class GoalUpdate(BaseModel):
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None


@router.get("/")
async def list_goals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NutritionGoal))
    goals = {g.person: {"calories": g.calories, "protein": g.protein, "carbs": g.carbs, "fat": g.fat, "fiber": g.fiber}
             for g in result.scalars().all()}
    # Fill in defaults for any missing persons
    for person, defaults in DEFAULT_GOALS.items():
        if person not in goals:
            goals[person] = defaults
    return goals


@router.get("/{person}")
async def get_goal(person: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NutritionGoal).where(NutritionGoal.person == person))
    goal = result.scalar_one_or_none()
    if goal:
        return {"person": person, "calories": goal.calories, "protein": goal.protein,
                "carbs": goal.carbs, "fat": goal.fat, "fiber": goal.fiber}
    return {"person": person, **DEFAULT_GOALS.get(person, {"calories": 2000, "protein": 150, "carbs": 250, "fat": 65, "fiber": 30})}


@router.put("/{person}")
async def upsert_goal(person: str, data: GoalUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NutritionGoal).where(NutritionGoal.person == person))
    goal = result.scalar_one_or_none()
    if goal:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(goal, field, value)
    else:
        defaults = DEFAULT_GOALS.get(person, {"calories": 2000, "protein": 150, "carbs": 250, "fat": 65, "fiber": 30})
        merged = {**defaults, **data.model_dump(exclude_unset=True)}
        goal = NutritionGoal(person=person, **merged)
        db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return {"person": person, "calories": goal.calories, "protein": goal.protein,
            "carbs": goal.carbs, "fat": goal.fat, "fiber": goal.fiber}
