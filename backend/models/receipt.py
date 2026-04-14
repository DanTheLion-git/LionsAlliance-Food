from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, func
from database import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    store = Column(String, nullable=False)  # jumbo, netto, manual
    filename = Column(String, nullable=True)
    upload_date = Column(DateTime, server_default=func.now())
    purchase_date = Column(DateTime, nullable=True)
    parsed = Column(Boolean, default=False)
    total_price = Column(Float, nullable=True)


class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id = Column(Integer, primary_key=True, index=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id"), nullable=False)
    raw_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=True, default=1.0)
    price = Column(Float, nullable=True)
    food_item_id = Column(Integer, ForeignKey("food_items.id"), nullable=True)
    reviewed = Column(Boolean, default=False)
    parsed_weight_g = Column(Float, nullable=True)


class ReceiptNameMapping(Base):
    """Remembers raw_name → food_item_id so future receipts auto-link."""
    __tablename__ = "receipt_name_mappings"

    id = Column(Integer, primary_key=True, index=True)
    raw_name = Column(String, nullable=False, unique=True, index=True)
    food_item_id = Column(Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
