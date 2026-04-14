from sqlalchemy import Column, Integer, String, Float, DateTime, func
from database import Base


class FoodItem(Base):
    __tablename__ = "food_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    brand = Column(String, nullable=True)
    barcode = Column(String, nullable=True, unique=True, index=True)
    off_id = Column(String, nullable=True)  # Open Food Facts ID

    # Macros per 100g
    calories_per_100g = Column(Float, nullable=True)
    protein_per_100g = Column(Float, nullable=True)
    carbs_per_100g = Column(Float, nullable=True)
    fat_per_100g = Column(Float, nullable=True)
    fiber_per_100g = Column(Float, nullable=True)
    sugar_per_100g = Column(Float, nullable=True)
    sodium_per_100g = Column(Float, nullable=True)

    # Serving info
    serving_size_g = Column(Float, nullable=True)
    unit = Column(String, default="g")  # g, ml, piece

    source = Column(String, default="manual")  # manual, open_food_facts
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
