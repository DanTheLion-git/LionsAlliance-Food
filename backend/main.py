from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base
from routers import foods, inventory, meals, receipts, nutrition, consumption
from routers import goals, shopping, meal_plan, reports
import models.consumption  # noqa: F401 — ensures table is created
import models.nutrition_goal  # noqa: F401
import models.shopping_list  # noqa: F401
import models.meal_plan  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="LionsAlliance Food Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(foods.router, prefix="/api/foods", tags=["foods"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(meals.router, prefix="/api/meals", tags=["meals"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["receipts"])
app.include_router(nutrition.router, prefix="/api/nutrition", tags=["nutrition"])
app.include_router(consumption.router, prefix="/api/consumption", tags=["consumption"])
app.include_router(goals.router, prefix="/api/goals", tags=["goals"])
app.include_router(shopping.router, prefix="/api/shopping", tags=["shopping"])
app.include_router(meal_plan.router, prefix="/api/meal-plan", tags=["meal-plan"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
