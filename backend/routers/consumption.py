from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timedelta

from database import get_db
from models.consumption import ConsumptionLog
from models.inventory import InventoryItem
from models.food import FoodItem

router = APIRouter()


class ConsumptionCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    food_item_id: Optional[int] = None
    raw_name: Optional[str] = None
    person: str  # "daniel", "thirza", "other"
    amount: float
    unit: str = "piece"
    consumed_at: Optional[datetime] = None
    notes: Optional[str] = None


class ConsumptionRead(BaseModel):
    id: int
    inventory_item_id: Optional[int]
    food_item_id: Optional[int]
    raw_name: Optional[str]
    person: str
    amount: float
    unit: str
    consumed_at: datetime
    notes: Optional[str]
    calories: Optional[float]
    protein: Optional[float]
    carbs: Optional[float]
    fat: Optional[float]
    food_name: Optional[str] = None
    food_brand: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/summary")
async def consumption_summary(
    date_str: Optional[str] = Query(None, alias="date"),
    db: AsyncSession = Depends(get_db),
):
    """Returns per-person macro totals for a given day (default today)."""
    if date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            d = datetime.utcnow().date()
    else:
        d = datetime.utcnow().date()

    query = select(ConsumptionLog).where(
        ConsumptionLog.consumed_at >= datetime(d.year, d.month, d.day),
        ConsumptionLog.consumed_at < datetime(d.year, d.month, d.day) + timedelta(days=1),
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    summary = {}
    for log in logs:
        p = log.person
        if p not in summary:
            summary[p] = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "items": 0}
        summary[p]["calories"] += log.calories or 0
        summary[p]["protein"] += log.protein or 0
        summary[p]["carbs"] += log.carbs or 0
        summary[p]["fat"] += log.fat or 0
        summary[p]["items"] += 1

    return {"date": str(d), "summary": summary}


@router.get("/", response_model=list[ConsumptionRead])
async def list_consumption(
    date_str: Optional[str] = Query(None, alias="date"),
    person: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(ConsumptionLog).order_by(ConsumptionLog.consumed_at.desc())
    if date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            query = query.where(
                ConsumptionLog.consumed_at >= datetime(d.year, d.month, d.day),
                ConsumptionLog.consumed_at < datetime(d.year, d.month, d.day) + timedelta(days=1),
            )
        except ValueError:
            pass
    if person:
        query = query.where(ConsumptionLog.person == person)

    result = await db.execute(query)
    logs = result.scalars().all()

    enriched = []
    for log in logs:
        row = ConsumptionRead.model_validate(log)
        if log.food_item_id:
            food_r = await db.execute(select(FoodItem).where(FoodItem.id == log.food_item_id))
            food = food_r.scalar_one_or_none()
            if food:
                row.food_name = food.name
                row.food_brand = food.brand
        enriched.append(row)
    return enriched


@router.post("/", response_model=list[ConsumptionRead])
async def create_consumption(data: list[ConsumptionCreate], db: AsyncSession = Depends(get_db)):
    """Create one or more consumption log entries (multiple for split between people)."""
    created = []
    for entry in data:
        # Look up macro info if we have a food_item_id
        calories = protein = carbs = fat = None
        food_item_id = entry.food_item_id
        raw_name = entry.raw_name

        if not food_item_id and entry.inventory_item_id:
            inv_r = await db.execute(select(InventoryItem).where(InventoryItem.id == entry.inventory_item_id))
            inv = inv_r.scalar_one_or_none()
            if inv:
                food_item_id = inv.food_item_id
                raw_name = raw_name or inv.raw_name

        if food_item_id:
            food_r = await db.execute(select(FoodItem).where(FoodItem.id == food_item_id))
            food = food_r.scalar_one_or_none()
            if food and food.calories_per_100g:
                if entry.unit == "g":
                    factor = entry.amount / 100.0
                elif entry.unit == "piece" and food.serving_size_g:
                    factor = (food.serving_size_g * entry.amount) / 100.0
                else:
                    factor = entry.amount
                calories = round((food.calories_per_100g or 0) * factor, 1)
                protein = round((food.protein_per_100g or 0) * factor, 1)
                carbs = round((food.carbs_per_100g or 0) * factor, 1)
                fat = round((food.fat_per_100g or 0) * factor, 1)

        log = ConsumptionLog(
            inventory_item_id=entry.inventory_item_id,
            food_item_id=food_item_id,
            raw_name=raw_name,
            person=entry.person,
            amount=entry.amount,
            unit=entry.unit,
            consumed_at=entry.consumed_at or datetime.utcnow(),
            notes=entry.notes,
            calories=calories,
            protein=protein,
            carbs=carbs,
            fat=fat,
        )
        db.add(log)
        created.append(log)

    await db.commit()
    for log in created:
        await db.refresh(log)

    result_list = []
    for log in created:
        row = ConsumptionRead.model_validate(log)
        if log.food_item_id:
            food_r = await db.execute(select(FoodItem).where(FoodItem.id == log.food_item_id))
            food = food_r.scalar_one_or_none()
            if food:
                row.food_name = food.name
                row.food_brand = food.brand
        result_list.append(row)
    return result_list


@router.delete("/{log_id}")
async def delete_consumption(log_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConsumptionLog).where(ConsumptionLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Consumption log not found")
    await db.delete(log)
    await db.commit()
    return {"ok": True}
