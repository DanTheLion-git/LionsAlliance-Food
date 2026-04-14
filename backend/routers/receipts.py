import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models.receipt import Receipt, ReceiptItem, ReceiptNameMapping
from models.food import FoodItem
from models.inventory import InventoryItem
from services.receipt_parser import parse_jumbo_png, parse_netto_pdf

router = APIRouter()

UPLOAD_BASE = "/app/uploads"


class LinkItemBody(BaseModel):
    food_item_id: int


class AddToInventoryBody(BaseModel):
    quantity: float = 1.0
    unit: str = "g"


@router.get("/")
async def list_receipts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Receipt).order_by(Receipt.upload_date.desc()))
    receipts = result.scalars().all()
    out = []
    for r in receipts:
        items_result = await db.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == r.id))
        items = items_result.scalars().all()
        out.append({
            "id": r.id,
            "store": r.store,
            "filename": r.filename,
            "upload_date": r.upload_date,
            "parsed": r.parsed,
            "total_price": r.total_price,
            "item_count": len(items),
        })
    return out


@router.post("/upload")
async def upload_receipt(
    store: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    store = store.lower()
    if store not in ("jumbo", "netto"):
        raise HTTPException(status_code=400, detail="store must be 'jumbo' or 'netto'")

    upload_dir = os.path.join(UPLOAD_BASE, store)
    os.makedirs(upload_dir, exist_ok=True)
    filename = file.filename or "upload"
    filepath = os.path.join(upload_dir, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    # Parse receipt
    try:
        if store == "jumbo":
            parsed_items = parse_jumbo_png(filepath)
            purchase_date = None
        else:
            parsed_items, purchase_date = parse_netto_pdf(filepath)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Parsing failed: {e}")

    # Create Receipt record
    receipt = Receipt(store=store, filename=filename, parsed=True, purchase_date=purchase_date)
    db.add(receipt)
    await db.flush()  # get receipt.id

    created_items = []
    for p in parsed_items:
        food_id = None
        reviewed = False
        added_to_inventory = False

        # Check known name mapping (user-confirmed links only)
        mapping_result = await db.execute(
            select(ReceiptNameMapping).where(ReceiptNameMapping.raw_name == p["raw_name"])
        )
        mapping = mapping_result.scalar_one_or_none()
        if mapping:
            food_id = mapping.food_item_id
            reviewed = True
            # Auto-add to inventory for known items
            inv = InventoryItem(
                food_item_id=food_id,
                receipt_id=receipt.id,
                quantity=p.get("quantity", 1.0),
                quantity_remaining=p.get("quantity", 1.0),
                unit="piece",
                purchase_date=purchase_date or receipt.upload_date,
            )
            db.add(inv)
            added_to_inventory = True

        ri = ReceiptItem(
            receipt_id=receipt.id,
            raw_name=p["raw_name"],
            price=p.get("price"),
            quantity=p.get("quantity", 1.0),
            food_item_id=food_id,
            reviewed=reviewed,
        )
        db.add(ri)
        created_items.append((ri, added_to_inventory))

    await db.commit()
    await db.refresh(receipt)

    return {
        "id": receipt.id,
        "store": receipt.store,
        "filename": receipt.filename,
        "parsed": receipt.parsed,
        "items": [
            {
                "id": ri.id,
                "raw_name": ri.raw_name,
                "price": ri.price,
                "quantity": ri.quantity,
                "food_item_id": ri.food_item_id,
                "reviewed": ri.reviewed,
                "added_to_inventory": added,
            }
            for ri, added in created_items
        ],
    }


@router.get("/{receipt_id}")
async def get_receipt(receipt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    items_result = await db.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt_id))
    items = items_result.scalars().all()

    enriched_items = []
    for item in items:
        food = None
        if item.food_item_id:
            food_result = await db.execute(select(FoodItem).where(FoodItem.id == item.food_item_id))
            food = food_result.scalar_one_or_none()
        enriched_items.append({
            "id": item.id,
            "raw_name": item.raw_name,
            "price": item.price,
            "quantity": item.quantity,
            "reviewed": item.reviewed,
            "food_item_id": item.food_item_id,
            "food": {
                "id": food.id,
                "name": food.name,
                "brand": food.brand,
                "calories_per_100g": food.calories_per_100g,
            } if food else None,
        })

    return {
        "id": receipt.id,
        "store": receipt.store,
        "filename": receipt.filename,
        "upload_date": receipt.upload_date,
        "parsed": receipt.parsed,
        "total_price": receipt.total_price,
        "items": enriched_items,
    }


@router.post("/{receipt_id}/items/{item_id}/link")
async def link_receipt_item(
    receipt_id: int,
    item_id: int,
    body: LinkItemBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReceiptItem).where(ReceiptItem.id == item_id, ReceiptItem.receipt_id == receipt_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Receipt item not found")

    food_result = await db.execute(select(FoodItem).where(FoodItem.id == body.food_item_id))
    if not food_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Food item not found")

    item.food_item_id = body.food_item_id
    item.reviewed = True

    # Save/update name mapping so future receipts auto-link this raw_name
    mapping_result = await db.execute(
        select(ReceiptNameMapping).where(ReceiptNameMapping.raw_name == item.raw_name)
    )
    mapping = mapping_result.scalar_one_or_none()
    if mapping:
        mapping.food_item_id = body.food_item_id
    else:
        db.add(ReceiptNameMapping(raw_name=item.raw_name, food_item_id=body.food_item_id))

    await db.commit()
    return {"ok": True, "food_item_id": body.food_item_id}


@router.delete("/{receipt_id}/items/{item_id}")
async def delete_receipt_item(
    receipt_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReceiptItem).where(ReceiptItem.id == item_id, ReceiptItem.receipt_id == receipt_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Receipt item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}


@router.delete("/{receipt_id}")
async def delete_receipt(receipt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    # Delete inventory items linked to this receipt first
    inv_items = await db.execute(select(InventoryItem).where(InventoryItem.receipt_id == receipt_id))
    for inv in inv_items.scalars().all():
        await db.delete(inv)
    # Delete receipt items
    items = await db.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt_id))
    for item in items.scalars().all():
        await db.delete(item)
    await db.delete(receipt)
    await db.commit()
    return {"ok": True}


@router.post("/{receipt_id}/items/{item_id}/add-to-inventory")
async def add_receipt_item_to_inventory(
    receipt_id: int,
    item_id: int,
    body: AddToInventoryBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReceiptItem).where(ReceiptItem.id == item_id, ReceiptItem.receipt_id == receipt_id)
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Receipt item not found")
    if not ri.food_item_id:
        raise HTTPException(status_code=400, detail="Receipt item not linked to a food item yet")

    inv = InventoryItem(
        food_item_id=ri.food_item_id,
        receipt_id=receipt_id,
        quantity=body.quantity,
        unit=body.unit,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return {"ok": True, "inventory_item_id": inv.id}
