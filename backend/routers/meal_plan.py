from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta

from database import get_db
from models.meal_plan import MealPlanEntry
from models.meal import Meal

router = APIRouter()


class MealPlanCreate(BaseModel):
    planned_date: date
    meal_type: str = "dinner"  # breakfast, lunch, dinner, snack
    meal_id: Optional[int] = None
    meal_name_override: Optional[str] = None
    servings: float = 1.0
    person: Optional[str] = None
    notes: Optional[str] = None


def _serialize(entry: MealPlanEntry, meal: Optional[Meal] = None) -> dict:
    return {
        "id": entry.id,
        "planned_date": str(entry.planned_date),
        "meal_type": entry.meal_type,
        "meal_id": entry.meal_id,
        "meal_name": meal.name if meal else entry.meal_name_override,
        "meal_name_override": entry.meal_name_override,
        "servings": entry.servings,
        "person": entry.person,
        "notes": entry.notes,
        "created_at": entry.created_at,
    }


@router.get("/")
async def list_meal_plan(
    week: Optional[str] = Query(None, description="ISO week string YYYY-Www or start date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Return meal plan entries. Filter by week (7 days from given start date or ISO week)."""
    query = select(MealPlanEntry).order_by(MealPlanEntry.planned_date.asc())
    if week:
        try:
            start = date.fromisoformat(week)
        except ValueError:
            try:
                # Try ISO week format YYYY-Www
                start = date.fromisocalendar(int(week[:4]), int(week[6:]), 1)
            except Exception:
                start = date.today()
        end = start + timedelta(days=6)
        query = query.where(MealPlanEntry.planned_date >= start, MealPlanEntry.planned_date <= end)

    result = await db.execute(query)
    entries = result.scalars().all()
    out = []
    for entry in entries:
        meal = None
        if entry.meal_id:
            meal_r = await db.execute(select(Meal).where(Meal.id == entry.meal_id))
            meal = meal_r.scalar_one_or_none()
        out.append(_serialize(entry, meal))
    return out


@router.post("/")
async def create_meal_plan_entry(data: MealPlanCreate, db: AsyncSession = Depends(get_db)):
    entry = MealPlanEntry(**data.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    meal = None
    if entry.meal_id:
        meal_r = await db.execute(select(Meal).where(Meal.id == entry.meal_id))
        meal = meal_r.scalar_one_or_none()
    return _serialize(entry, meal)


@router.delete("/{entry_id}")
async def delete_meal_plan_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MealPlanEntry).where(MealPlanEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}
