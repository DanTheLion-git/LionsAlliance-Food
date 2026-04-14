from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, datetime, timedelta

from database import get_db
from models.meal import MealLog, Meal, MealIngredient
from models.food import FoodItem

router = APIRouter()


def _sum_macros_for_logs(logs_with_ingredients: list) -> dict:
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    for log, ings, food_map in logs_with_ingredients:
        for ing in ings:
            food = food_map.get(ing.food_item_id)
            if not food:
                continue
            factor = (ing.amount_grams / 100.0) * log.servings
            totals["calories"] += (food.calories_per_100g or 0) * factor
            totals["protein"] += (food.protein_per_100g or 0) * factor
            totals["carbs"] += (food.carbs_per_100g or 0) * factor
            totals["fat"] += (food.fat_per_100g or 0) * factor
    return {k: round(v, 1) for k, v in totals.items()}


async def _get_day_summary(day: date, db: AsyncSession) -> dict:
    start = datetime(day.year, day.month, day.day)
    end = start + timedelta(days=1)

    logs_result = await db.execute(
        select(MealLog).where(MealLog.logged_at >= start, MealLog.logged_at < end)
    )
    logs = logs_result.scalars().all()

    meal_entries = []
    all_log_data = []

    for log in logs:
        meal_result = await db.execute(select(Meal).where(Meal.id == log.meal_id))
        meal = meal_result.scalar_one_or_none()
        ings_result = await db.execute(select(MealIngredient).where(MealIngredient.meal_id == log.meal_id))
        ings = ings_result.scalars().all()
        food_ids = [i.food_item_id for i in ings]
        food_map = {}
        if food_ids:
            foods_result = await db.execute(select(FoodItem).where(FoodItem.id.in_(food_ids)))
            food_map = {f.id: f for f in foods_result.scalars().all()}

        all_log_data.append((log, ings, food_map))

        log_macros = _sum_macros_for_logs([(log, ings, food_map)])
        meal_entries.append({
            "meal_name": meal.name if meal else f"Meal #{log.meal_id}",
            "logged_at": log.logged_at,
            "servings": log.servings,
            "calories": log_macros["calories"],
            "protein": log_macros["protein"],
            "carbs": log_macros["carbs"],
            "fat": log_macros["fat"],
        })

    totals = _sum_macros_for_logs(all_log_data)
    return {
        "date": day.isoformat(),
        "total_calories": totals["calories"],
        "total_protein": totals["protein"],
        "total_carbs": totals["carbs"],
        "total_fat": totals["fat"],
        "meals": meal_entries,
    }


@router.get("/daily")
async def get_daily_nutrition(
    date: str = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
):
    if date:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    else:
        day = datetime.utcnow().date()
    return await _get_day_summary(day, db)


@router.get("/history")
async def get_nutrition_history(db: AsyncSession = Depends(get_db)):
    today = datetime.utcnow().date()
    results = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        summary = await _get_day_summary(day, db)
        results.append({
            "date": summary["date"],
            "total_calories": summary["total_calories"],
            "total_protein": summary["total_protein"],
            "total_carbs": summary["total_carbs"],
            "total_fat": summary["total_fat"],
        })
    return results
