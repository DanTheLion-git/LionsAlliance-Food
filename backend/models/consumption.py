from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, func
from database import Base


class ConsumptionLog(Base):
    __tablename__ = "consumption_logs"

    id = Column(Integer, primary_key=True, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True)
    food_item_id = Column(Integer, ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True)
    raw_name = Column(String, nullable=True)  # fallback display name if no food_item
    person = Column(String, nullable=False)   # "daniel", "thirza", "other"
    amount = Column(Float, nullable=False)
    unit = Column(String, nullable=False, default="piece")
    consumed_at = Column(DateTime, nullable=False, server_default=func.now())
    notes = Column(String, nullable=True)
    # Macros at time of consumption (denormalized for history)
    calories = Column(Float, nullable=True)
    protein = Column(Float, nullable=True)
    carbs = Column(Float, nullable=True)
    fat = Column(Float, nullable=True)
