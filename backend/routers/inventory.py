from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models.inventory import InventoryItem
from models.food import FoodItem

router = APIRouter()


class InventoryItemCreate(BaseModel):
    food_item_id: int
    quantity: float = 1.0
    unit: str = "g"
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    receipt_id: Optional[int] = None


class InventoryItemUpdate(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None


class InventoryItemRead(BaseModel):
    id: int
    food_item_id: int
    receipt_id: Optional[int]
    quantity: float
    unit: Optional[str]
    purchase_date: Optional[datetime]
    expiry_date: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]
    # joined food info
    food_name: Optional[str] = None
    food_brand: Optional[str] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=list[InventoryItemRead])
async def list_inventory(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem))
    items = result.scalars().all()

    enriched = []
    for item in items:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = food_result.scalar_one_or_none()
        row = InventoryItemRead.model_validate(item)
        if food:
            row.food_name = food.name
            row.food_brand = food.brand
            row.calories_per_100g = food.calories_per_100g
            row.protein_per_100g = food.protein_per_100g
            row.carbs_per_100g = food.carbs_per_100g
            row.fat_per_100g = food.fat_per_100g
        enriched.append(row)
    return enriched


@router.post("/", response_model=InventoryItemRead)
async def create_inventory_item(data: InventoryItemCreate, db: AsyncSession = Depends(get_db)):
    food_result = await db.execute(select(FoodItem).where(FoodItem.id == data.food_item_id))
    if not food_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Food item not found")

    item = InventoryItem(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)

    food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
    food = food_result.scalar_one_or_none()
    row = InventoryItemRead.model_validate(item)
    if food:
        row.food_name = food.name
        row.food_brand = food.brand
        row.calories_per_100g = food.calories_per_100g
        row.protein_per_100g = food.protein_per_100g
        row.carbs_per_100g = food.carbs_per_100g
        row.fat_per_100g = food.fat_per_100g
    return row


@router.get("/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
    food = food_result.scalar_one_or_none()
    row = InventoryItemRead.model_validate(item)
    if food:
        row.food_name = food.name
        row.food_brand = food.brand
        row.calories_per_100g = food.calories_per_100g
        row.protein_per_100g = food.protein_per_100g
        row.carbs_per_100g = food.carbs_per_100g
        row.fat_per_100g = food.fat_per_100g
    return row


@router.put("/{item_id}", response_model=InventoryItemRead)
async def update_inventory_item(item_id: int, data: InventoryItemUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)

    food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
    food = food_result.scalar_one_or_none()
    row = InventoryItemRead.model_validate(item)
    if food:
        row.food_name = food.name
        row.food_brand = food.brand
    return row


@router.delete("/{item_id}")
async def delete_inventory_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
