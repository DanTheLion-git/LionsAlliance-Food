from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base
from routers import foods, inventory, meals, receipts, nutrition


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
