from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, func
from database import Base


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=True, default=1.0)
    unit = Column(String, nullable=True, default="piece")
    checked = Column(Boolean, default=False)
    food_item_id = Column(Integer, ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
