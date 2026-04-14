from sqlalchemy import Column, Integer, String, Float, DateTime, func
from database import Base


class NutritionGoal(Base):
    __tablename__ = "nutrition_goals"

    id = Column(Integer, primary_key=True, index=True)
    person = Column(String, nullable=False, unique=True, index=True)  # daniel, thirza
    calories = Column(Float, nullable=True, default=2000.0)
    protein = Column(Float, nullable=True, default=150.0)
    carbs = Column(Float, nullable=True, default=250.0)
    fat = Column(Float, nullable=True, default=65.0)
    fiber = Column(Float, nullable=True, default=30.0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
