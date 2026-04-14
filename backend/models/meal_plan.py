from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, func
from database import Base


class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"

    id = Column(Integer, primary_key=True, index=True)
    planned_date = Column(Date, nullable=False, index=True)
    meal_type = Column(String, nullable=False, default="dinner")  # breakfast, lunch, dinner, snack
    meal_id = Column(Integer, ForeignKey("meals.id", ondelete="SET NULL"), nullable=True)
    meal_name_override = Column(String, nullable=True)  # free-text when no meal_id
    servings = Column(Float, nullable=True, default=1.0)
    person = Column(String, nullable=True)  # daniel, thirza, both, null = whole family
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
