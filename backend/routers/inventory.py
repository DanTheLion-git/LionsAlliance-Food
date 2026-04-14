from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from database import get_db
from models.inventory import InventoryItem
from models.food import FoodItem

router = APIRouter()


class InventoryItemCreate(BaseModel):
    food_item_id: Optional[int] = None
    quantity: float = 1.0
    unit: str = "piece"
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    receipt_id: Optional[int] = None
    raw_name: Optional[str] = None
    location: Optional[str] = "pantry"


class InventoryItemUpdate(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    quantity_remaining: Optional[float] = None
    discard_reason: Optional[str] = None
    consumed_date: Optional[datetime] = None
    location: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str
    quantity_remaining: Optional[float] = None
    discard_reason: Optional[str] = None


class InventoryItemRead(BaseModel):
    id: int
    food_item_id: Optional[int] = None
    receipt_id: Optional[int]
    receipt_item_id: Optional[int] = None
    raw_name: Optional[str] = None
    quantity: float
    unit: Optional[str]
    purchase_date: Optional[datetime]
    expiry_date: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]
    status: Optional[str] = "in_stock"
    quantity_remaining: Optional[float] = None
    discard_reason: Optional[str] = None
    consumed_date: Optional[datetime] = None
    location: Optional[str] = None
    # joined food info
    food_name: Optional[str] = None
    food_brand: Optional[str] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    serving_size_g: Optional[float] = None

    class Config:
        from_attributes = True


def _enrich(row: InventoryItemRead, food: Optional[FoodItem], item: Optional[InventoryItem] = None) -> InventoryItemRead:
    if food:
        row.food_name = food.name
        row.food_brand = food.brand
        row.calories_per_100g = food.calories_per_100g
        row.protein_per_100g = food.protein_per_100g
        row.carbs_per_100g = food.carbs_per_100g
        row.fat_per_100g = food.fat_per_100g
        row.serving_size_g = food.serving_size_g
    elif item and item.raw_name:
        row.food_name = f"[Unlinked] {item.raw_name}"
    return row


@router.get("/expiring", response_model=list[InventoryItemRead])
async def get_expiring_items(days: int = 7, db: AsyncSession = Depends(get_db)):
    cutoff = datetime.utcnow() + timedelta(days=days)
    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.status == "in_stock")
        .where(InventoryItem.expiry_date != None)
        .where(InventoryItem.expiry_date <= cutoff)
        .order_by(InventoryItem.expiry_date.asc())
    )
    items = result.scalars().all()
    enriched = []
    for item in items:
        food = None
        if item.food_item_id:
            food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
            food = food_result.scalar_one_or_none()
        enriched.append(_enrich(InventoryItemRead.model_validate(item), food, item))
    return enriched


@router.get("/", response_model=list[InventoryItemRead])
async def list_inventory(include_all: bool = Query(False, alias="include_all"), db: AsyncSession = Depends(get_db)):
    query = select(InventoryItem)
    if not include_all:
        query = query.where(InventoryItem.status != "discarded")
    result = await db.execute(query)
    items = result.scalars().all()

    enriched = []
    for item in items:
        food = None
        if item.food_item_id:
            food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
            food = food_result.scalar_one_or_none()
        enriched.append(_enrich(InventoryItemRead.model_validate(item), food, item))
    return enriched


@router.post("/", response_model=InventoryItemRead)
async def create_inventory_item(data: InventoryItemCreate, db: AsyncSession = Depends(get_db)):
    if data.food_item_id:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == data.food_item_id))
        if not food_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Food item not found")

    dump = data.model_dump()
    dump.setdefault("quantity_remaining", dump.get("quantity", 1.0))
    item = InventoryItem(**dump)
    db.add(item)
    await db.commit()
    await db.refresh(item)

    food = None
    if item.food_item_id:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = food_result.scalar_one_or_none()
    return _enrich(InventoryItemRead.model_validate(item), food, item)


@router.get("/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    food = None
    if item.food_item_id:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = food_result.scalar_one_or_none()
    return _enrich(InventoryItemRead.model_validate(item), food, item)


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

    food = None
    if item.food_item_id:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = food_result.scalar_one_or_none()
    return _enrich(InventoryItemRead.model_validate(item), food, item)


@router.patch("/{item_id}/status", response_model=InventoryItemRead)
async def update_item_status(item_id: int, data: StatusUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    item.status = data.status
    if data.quantity_remaining is not None:
        item.quantity_remaining = data.quantity_remaining
    if data.discard_reason is not None:
        item.discard_reason = data.discard_reason
    if data.status in ("consumed", "discarded"):
        item.consumed_date = datetime.utcnow()

    await db.commit()
    await db.refresh(item)

    food = None
    if item.food_item_id:
        food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
        food = food_result.scalar_one_or_none()
    return _enrich(InventoryItemRead.model_validate(item), food, item)


@router.delete("/{item_id}")
async def delete_inventory_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}


class BulkStatusUpdate(BaseModel):
    ids: list[int]
    status: str
    discard_reason: Optional[str] = None


@router.post("/bulk-status")
async def bulk_update_status(data: BulkStatusUpdate, db: AsyncSession = Depends(get_db)):
    """Set status on multiple inventory items at once."""
    updated = 0
    for item_id in data.ids:
        result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
        item = result.scalar_one_or_none()
        if item:
            item.status = data.status
            if data.discard_reason:
                item.discard_reason = data.discard_reason
            if data.status in ("consumed", "discarded"):
                item.consumed_date = datetime.utcnow()
            updated += 1
    await db.commit()
    return {"ok": True, "updated": updated}

