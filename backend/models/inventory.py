from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, func
from database import Base


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    food_item_id = Column(Integer, ForeignKey("food_items.id"), nullable=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id"), nullable=True)
    receipt_item_id = Column(Integer, ForeignKey("receipt_items.id"), nullable=True)

    raw_name = Column(String, nullable=True)
    quantity = Column(Float, nullable=False, default=1.0)
    unit = Column(String, default="piece")
    purchase_date = Column(DateTime, nullable=True)
    expiry_date = Column(DateTime, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    status = Column(String, default="in_stock")
    quantity_remaining = Column(Float, nullable=True)
    discard_reason = Column(String, nullable=True)
    consumed_date = Column(DateTime, nullable=True)
