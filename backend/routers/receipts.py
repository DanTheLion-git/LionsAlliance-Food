import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models.receipt import Receipt, ReceiptItem, ReceiptNameMapping
from models.food import FoodItem
from models.inventory import InventoryItem
from services.receipt_parser import parse_jumbo_png, parse_netto_pdf, parse_albert_heijn_pdf, parse_lidl_pdf, parse_aldi_pdf

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
            "purchase_date": r.purchase_date,
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
    if store not in ("jumbo", "netto", "albert_heijn", "lidl", "aldi"):
        raise HTTPException(status_code=400, detail="store must be one of: jumbo, netto, albert_heijn, lidl, aldi")

    upload_dir = os.path.join(UPLOAD_BASE, store)
    os.makedirs(upload_dir, exist_ok=True)
    filename = os.path.basename(file.filename or "upload")
    filepath = os.path.join(upload_dir, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    # Parse receipt
    try:
        if store == "jumbo":
            parsed_items = parse_jumbo_png(filepath)
            purchase_date = None
        elif store == "netto":
            parsed_items, purchase_date = parse_netto_pdf(filepath)
        elif store == "albert_heijn":
            parsed_items, purchase_date = parse_albert_heijn_pdf(filepath)
        elif store == "lidl":
            parsed_items, purchase_date = parse_lidl_pdf(filepath)
        elif store == "aldi":
            parsed_items, purchase_date = parse_aldi_pdf(filepath)
        else:
            parsed_items, purchase_date = [], None
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

        mapping_result = await db.execute(
            select(ReceiptNameMapping).where(ReceiptNameMapping.raw_name == p["raw_name"])
        )
        mapping = mapping_result.scalar_one_or_none()
        if mapping:
            food_id = mapping.food_item_id
            reviewed = True

        ri = ReceiptItem(
            receipt_id=receipt.id,
            raw_name=p["raw_name"],
            price=p.get("price"),
            quantity=p.get("quantity", 1.0),
            food_item_id=food_id,
            reviewed=reviewed,
            parsed_weight_g=p.get("parsed_weight_g"),
        )
        db.add(ri)
        await db.flush()  # get ri.id

        inv = InventoryItem(
            food_item_id=food_id,
            raw_name=p["raw_name"],
            receipt_id=receipt.id,
            receipt_item_id=ri.id,
            quantity=p.get("quantity", 1.0),
            quantity_remaining=p.get("quantity", 1.0),
            unit="piece",
            purchase_date=purchase_date or receipt.upload_date,
            status="in_stock",
        )
        db.add(inv)
        created_items.append((ri, food_id is not None))

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
                "parsed_weight_g": ri.parsed_weight_g,
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
            "parsed_weight_g": item.parsed_weight_g,
            "reviewed": item.reviewed,
            "food_item_id": item.food_item_id,
            "food": {
                "id": food.id,
                "name": food.name,
                "brand": food.brand,
                "calories_per_100g": food.calories_per_100g,
                "serving_size_g": food.serving_size_g,
            } if food else None,
        })

    return {
        "id": receipt.id,
        "store": receipt.store,
        "filename": receipt.filename,
        "upload_date": receipt.upload_date,
        "purchase_date": receipt.purchase_date,
        "parsed": receipt.parsed,
        "total_price": receipt.total_price,
        "items": enriched_items,
    }


async def _apply_mapping_to_existing(db: AsyncSession, raw_name: str, food_item_id: int):
    """Retroactively link all existing unlinked receipt items and inventory items
    with this raw_name to the given food item."""
    # Update all unlinked ReceiptItems with this raw_name
    unlinked_items_result = await db.execute(
        select(ReceiptItem).where(
            ReceiptItem.raw_name == raw_name,
            ReceiptItem.food_item_id == None,  # noqa: E711
        )
    )
    for ri in unlinked_items_result.scalars().all():
        ri.food_item_id = food_item_id
        ri.reviewed = True

    # Update all unlinked InventoryItems with this raw_name
    unlinked_inv_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.raw_name == raw_name,
            InventoryItem.food_item_id == None,  # noqa: E711
        )
    )
    for inv in unlinked_inv_result.scalars().all():
        inv.food_item_id = food_item_id


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
    food = food_result.scalar_one_or_none()
    if not food:
        raise HTTPException(status_code=404, detail="Food item not found")

    item.food_item_id = body.food_item_id
    item.reviewed = True

    # Auto-fill food's serving_size_g from the receipt item's parsed weight if not set
    if food.serving_size_g is None and item.parsed_weight_g is not None:
        food.serving_size_g = item.parsed_weight_g

    # Save/update name mapping so future receipts auto-link this raw_name
    mapping_result = await db.execute(
        select(ReceiptNameMapping).where(ReceiptNameMapping.raw_name == item.raw_name)
    )
    mapping = mapping_result.scalar_one_or_none()
    if mapping:
        mapping.food_item_id = body.food_item_id
    else:
        db.add(ReceiptNameMapping(raw_name=item.raw_name, food_item_id=body.food_item_id))

    # Update the inventory item linked directly to this receipt item
    inv_result = await db.execute(
        select(InventoryItem).where(InventoryItem.receipt_item_id == item_id)
    )
    inv = inv_result.scalar_one_or_none()
    if inv:
        inv.food_item_id = body.food_item_id

    # Retroactively apply to ALL other unlinked items with the same raw_name
    await _apply_mapping_to_existing(db, item.raw_name, body.food_item_id)

    await db.commit()
    return {"ok": True, "food_item_id": body.food_item_id, "raw_name": item.raw_name}


@router.post("/apply-all-mappings")
async def apply_all_mappings(db: AsyncSession = Depends(get_db)):
    """Re-apply all saved ReceiptNameMappings to every existing unlinked receipt
    item and inventory item.  Safe to call multiple times (idempotent)."""
    mappings_result = await db.execute(select(ReceiptNameMapping))
    mappings = mappings_result.scalars().all()

    updated_items = 0
    updated_inv = 0
    for mapping in mappings:
        # Unlinked receipt items
        ri_result = await db.execute(
            select(ReceiptItem).where(
                ReceiptItem.raw_name == mapping.raw_name,
                ReceiptItem.food_item_id == None,  # noqa: E711
            )
        )
        for ri in ri_result.scalars().all():
            ri.food_item_id = mapping.food_item_id
            ri.reviewed = True
            updated_items += 1

        # Unlinked inventory items
        inv_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.raw_name == mapping.raw_name,
                InventoryItem.food_item_id == None,  # noqa: E711
            )
        )
        for inv in inv_result.scalars().all():
            inv.food_item_id = mapping.food_item_id
            updated_inv += 1

    await db.commit()
    return {
        "ok": True,
        "mappings_applied": len(mappings),
        "receipt_items_updated": updated_items,
        "inventory_items_updated": updated_inv,
    }


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
    # Null out receipt_id AND receipt_item_id on inventory items so they are PRESERVED
    inv_items = await db.execute(select(InventoryItem).where(InventoryItem.receipt_id == receipt_id))
    for inv in inv_items.scalars().all():
        inv.receipt_id = None
        inv.receipt_item_id = None
    # Delete receipt items (parsed lines)
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

