from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models.meal import Meal, MealIngredient, MealLog
from models.food import FoodItem

router = APIRouter()


def _compute_macros(ingredients: list, food_map: dict, servings: float = 1.0) -> dict:
    """Sum macros across all ingredients scaled by servings."""
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "fiber": 0.0}
    for ing in ingredients:
        food = food_map.get(ing.food_item_id)
        if not food:
            continue
        factor = (ing.amount_grams / 100.0) * servings
        totals["calories"] += (food.calories_per_100g or 0) * factor
        totals["protein"] += (food.protein_per_100g or 0) * factor
        totals["carbs"] += (food.carbs_per_100g or 0) * factor
        totals["fat"] += (food.fat_per_100g or 0) * factor
        totals["fiber"] += (food.fiber_per_100g or 0) * factor
    return {k: round(v, 1) for k, v in totals.items()}


class MealCreate(BaseModel):
    name: str
    description: Optional[str] = None


class MealUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class IngredientCreate(BaseModel):
    food_item_id: int
    amount_grams: Optional[float] = None
    percentage: Optional[float] = None
    reference_grams: Optional[float] = None


class IngredientUpdate(BaseModel):
    amount_grams: float


class MealLogCreate(BaseModel):
    servings: float = 1.0
    notes: Optional[str] = None


@router.get("/")
async def list_meals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).order_by(Meal.created_at.desc()))
    meals = result.scalars().all()
    out = []
    for meal in meals:
        ings_result = await db.execute(select(MealIngredient).where(MealIngredient.meal_id == meal.id))
        ings = ings_result.scalars().all()
        food_ids = [i.food_item_id for i in ings]
        food_map = {}
        if food_ids:
            foods_result = await db.execute(select(FoodItem).where(FoodItem.id.in_(food_ids)))
            food_map = {f.id: f for f in foods_result.scalars().all()}
        macros = _compute_macros(ings, food_map)
        out.append({
            "id": meal.id,
            "name": meal.name,
            "description": meal.description,
            "created_at": meal.created_at,
            "ingredient_count": len(ings),
            "total_calories": macros["calories"],
            "total_protein": macros["protein"],
            "total_carbs": macros["carbs"],
            "total_fat": macros["fat"],
        })
    return out


@router.post("/")
async def create_meal(data: MealCreate, db: AsyncSession = Depends(get_db)):
    meal = Meal(**data.model_dump())
    db.add(meal)
    await db.commit()
    await db.refresh(meal)
    return {"id": meal.id, "name": meal.name, "description": meal.description, "created_at": meal.created_at}


@router.get("/{meal_id}")
async def get_meal(meal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).where(Meal.id == meal_id))
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    ings_result = await db.execute(select(MealIngredient).where(MealIngredient.meal_id == meal_id))
    ings = ings_result.scalars().all()
    food_ids = [i.food_item_id for i in ings]
    food_map = {}
    if food_ids:
        foods_result = await db.execute(select(FoodItem).where(FoodItem.id.in_(food_ids)))
        food_map = {f.id: f for f in foods_result.scalars().all()}

    macros = _compute_macros(ings, food_map)

    ingredients_out = []
    for ing in ings:
        food = food_map.get(ing.food_item_id)
        ing_macros = _compute_macros([ing], food_map)
        ingredients_out.append({
            "id": ing.id,
            "food_item_id": ing.food_item_id,
            "amount_grams": ing.amount_grams,
            "food_name": food.name if food else None,
            "food_brand": food.brand if food else None,
            **{f"macro_{k}": v for k, v in ing_macros.items()},
        })

    return {
        "id": meal.id,
        "name": meal.name,
        "description": meal.description,
        "created_at": meal.created_at,
        "ingredients": ingredients_out,
        "total_macros": macros,
    }


@router.put("/{meal_id}")
async def update_meal(meal_id: int, data: MealUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).where(Meal.id == meal_id))
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(meal, field, value)
    await db.commit()
    await db.refresh(meal)
    return {"id": meal.id, "name": meal.name, "description": meal.description}


@router.delete("/{meal_id}")
async def delete_meal(meal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).where(Meal.id == meal_id))
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    # Cascade delete ingredients
    await db.execute(delete(MealIngredient).where(MealIngredient.meal_id == meal_id))
    await db.delete(meal)
    await db.commit()
    return {"ok": True}


@router.post("/{meal_id}/ingredients")
async def add_ingredient(meal_id: int, data: IngredientCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).where(Meal.id == meal_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meal not found")

    food_result = await db.execute(select(FoodItem).where(FoodItem.id == data.food_item_id))
    if not food_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Food item not found")

    amount_grams = data.amount_grams
    if amount_grams is None:
        if data.percentage is not None and data.reference_grams is not None:
            amount_grams = (data.percentage / 100.0) * data.reference_grams
        else:
            raise HTTPException(status_code=400, detail="Provide amount_grams or (percentage + reference_grams)")

    ing = MealIngredient(meal_id=meal_id, food_item_id=data.food_item_id, amount_grams=amount_grams)
    db.add(ing)
    await db.commit()
    await db.refresh(ing)
    return {"id": ing.id, "meal_id": ing.meal_id, "food_item_id": ing.food_item_id, "amount_grams": ing.amount_grams}


@router.put("/{meal_id}/ingredients/{ingredient_id}")
async def update_ingredient(meal_id: int, ingredient_id: int, data: IngredientUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MealIngredient).where(MealIngredient.id == ingredient_id, MealIngredient.meal_id == meal_id)
    )
    ing = result.scalar_one_or_none()
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    ing.amount_grams = data.amount_grams
    await db.commit()
    await db.refresh(ing)
    return {"id": ing.id, "amount_grams": ing.amount_grams}


@router.delete("/{meal_id}/ingredients/{ingredient_id}")
async def delete_ingredient(meal_id: int, ingredient_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MealIngredient).where(MealIngredient.id == ingredient_id, MealIngredient.meal_id == meal_id)
    )
    ing = result.scalar_one_or_none()
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    await db.delete(ing)
    await db.commit()
    return {"ok": True}


@router.post("/{meal_id}/log")
async def log_meal(meal_id: int, data: MealLogCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meal).where(Meal.id == meal_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meal not found")
    log_entry = MealLog(meal_id=meal_id, servings=data.servings, notes=data.notes)
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)
    return {"id": log_entry.id, "meal_id": log_entry.meal_id, "servings": log_entry.servings, "logged_at": log_entry.logged_at}
