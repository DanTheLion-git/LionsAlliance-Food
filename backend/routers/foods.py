from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import httpx

from database import get_db
from models.food import FoodItem

router = APIRouter()


class FoodItemCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    barcode: Optional[str] = None
    off_id: Optional[str] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    fiber_per_100g: Optional[float] = None
    sugar_per_100g: Optional[float] = None
    sodium_per_100g: Optional[float] = None
    serving_size_g: Optional[float] = None
    unit: str = "g"
    source: str = "manual"


class FoodItemUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    off_id: Optional[str] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    fiber_per_100g: Optional[float] = None
    sugar_per_100g: Optional[float] = None
    sodium_per_100g: Optional[float] = None
    serving_size_g: Optional[float] = None
    unit: Optional[str] = None
    source: Optional[str] = None


class FoodItemRead(BaseModel):
    id: int
    name: str
    brand: Optional[str]
    barcode: Optional[str]
    off_id: Optional[str]
    calories_per_100g: Optional[float]
    protein_per_100g: Optional[float]
    carbs_per_100g: Optional[float]
    fat_per_100g: Optional[float]
    fiber_per_100g: Optional[float]
    sugar_per_100g: Optional[float]
    sodium_per_100g: Optional[float]
    serving_size_g: Optional[float]
    unit: Optional[str]
    source: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("/", response_model=list[FoodItemRead])
async def list_foods(search: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    stmt = select(FoodItem)
    if search:
        stmt = stmt.where(FoodItem.name.ilike(f"%{search}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=FoodItemRead)
async def create_food(data: FoodItemCreate, db: AsyncSession = Depends(get_db)):
    item = FoodItem(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/search/off")
async def search_open_food_facts(q: str = Query(..., min_length=1)):
    """Search Open Food Facts by name and return macro candidates."""
    params = {
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 10,
        "fields": "product_name,brands,nutriments,code,serving_size,product_name_nl,product_name_de",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://world.openfoodfacts.org/cgi/search.pl", params=params)
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open Food Facts request failed: {e}")

    results = []
    for p in data.get("products", []):
        n = p.get("nutriments", {})
        kcal = n.get("energy-kcal_100g") or (n.get("energy_100g", 0) / 4.184 if n.get("energy_100g") else None)
        results.append({
            "name": p.get("product_name_nl") or p.get("product_name_de") or p.get("product_name", ""),
            "brand": p.get("brands", ""),
            "barcode": p.get("code", ""),
            "off_id": p.get("code", ""),
            "calories_per_100g": round(kcal, 1) if kcal else None,
            "protein_per_100g": n.get("proteins_100g"),
            "carbs_per_100g": n.get("carbohydrates_100g"),
            "fat_per_100g": n.get("fat_100g"),
            "fiber_per_100g": n.get("fiber_100g"),
            "sugar_per_100g": n.get("sugars_100g"),
            "sodium_per_100g": n.get("sodium_100g"),
        })
    return results


@router.get("/{item_id}", response_model=FoodItemRead)
async def get_food(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FoodItem).where(FoodItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
    return item


@router.put("/{item_id}", response_model=FoodItemRead)
async def update_food(item_id: int, data: FoodItemUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FoodItem).where(FoodItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}")
async def delete_food(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FoodItem).where(FoodItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
