from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.shopping_list import ShoppingListItem

router = APIRouter()


class ShoppingItemCreate(BaseModel):
    name: str
    quantity: Optional[float] = 1.0
    unit: Optional[str] = "piece"
    food_item_id: Optional[int] = None
    notes: Optional[str] = None


class ShoppingItemUpdate(BaseModel):
    checked: Optional[bool] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
async def list_shopping(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShoppingListItem).order_by(ShoppingListItem.checked.asc(), ShoppingListItem.created_at.asc()))
    items = result.scalars().all()
    return [{"id": i.id, "name": i.name, "quantity": i.quantity, "unit": i.unit,
             "checked": i.checked, "food_item_id": i.food_item_id, "notes": i.notes,
             "created_at": i.created_at} for i in items]


@router.post("/")
async def create_shopping_item(data: ShoppingItemCreate, db: AsyncSession = Depends(get_db)):
    item = ShoppingListItem(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "name": item.name, "quantity": item.quantity, "unit": item.unit,
            "checked": item.checked, "food_item_id": item.food_item_id, "notes": item.notes}


@router.patch("/{item_id}")
async def update_shopping_item(item_id: int, data: ShoppingItemUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShoppingListItem).where(ShoppingListItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "name": item.name, "quantity": item.quantity, "unit": item.unit,
            "checked": item.checked, "food_item_id": item.food_item_id, "notes": item.notes}


@router.delete("/clear-checked")
async def clear_checked(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShoppingListItem).where(ShoppingListItem.checked == True))  # noqa: E712
    count = 0
    for item in result.scalars().all():
        await db.delete(item)
        count += 1
    await db.commit()
    return {"ok": True, "deleted": count}


@router.delete("/{item_id}")
async def delete_shopping_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShoppingListItem).where(ShoppingListItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
