from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import datetime, timedelta, date

from database import get_db
from models.consumption import ConsumptionLog
from models.inventory import InventoryItem

router = APIRouter()


@router.get("/weekly")
async def weekly_report(
    start: Optional[str] = Query(None, description="Start date YYYY-MM-DD, defaults to 7 days ago"),
    db: AsyncSession = Depends(get_db),
):
    if start:
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
        except ValueError:
            start_dt = datetime.utcnow() - timedelta(days=6)
    else:
        start_dt = datetime.utcnow() - timedelta(days=6)
    end_dt = start_dt + timedelta(days=7)

    logs_result = await db.execute(
        select(ConsumptionLog).where(
            ConsumptionLog.consumed_at >= start_dt,
            ConsumptionLog.consumed_at < end_dt,
        ).order_by(ConsumptionLog.consumed_at.asc())
    )
    logs = logs_result.scalars().all()

    # Build per-day per-person totals
    days: dict = {}
    person_totals: dict = {}
    for log in logs:
        day = log.consumed_at.strftime("%Y-%m-%d")
        if day not in days:
            days[day] = {}
        p = log.person
        if p not in days[day]:
            days[day][p] = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "items": 0}
        days[day][p]["calories"] += log.calories or 0
        days[day][p]["protein"] += log.protein or 0
        days[day][p]["carbs"] += log.carbs or 0
        days[day][p]["fat"] += log.fat or 0
        days[day][p]["items"] += 1
        # overall totals
        if p not in person_totals:
            person_totals[p] = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "items": 0}
        person_totals[p]["calories"] += log.calories or 0
        person_totals[p]["protein"] += log.protein or 0
        person_totals[p]["carbs"] += log.carbs or 0
        person_totals[p]["fat"] += log.fat or 0
        person_totals[p]["items"] += 1

    # Discarded items in the period
    discarded_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.status == "discarded",
            InventoryItem.consumed_date >= start_dt,
            InventoryItem.consumed_date < end_dt,
        )
    )
    discarded = discarded_result.scalars().all()
    discarded_count = len(discarded)

    return {
        "start": start_dt.strftime("%Y-%m-%d"),
        "end": (end_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
        "days": days,
        "person_totals": person_totals,
        "discarded_count": discarded_count,
    }


@router.get("/monthly")
async def monthly_report(
    month: Optional[str] = Query(None, description="Month YYYY-MM, defaults to current month"),
    db: AsyncSession = Depends(get_db),
):
    if month:
        try:
            start_dt = datetime.strptime(month, "%Y-%m")
        except ValueError:
            now = datetime.utcnow()
            start_dt = datetime(now.year, now.month, 1)
    else:
        now = datetime.utcnow()
        start_dt = datetime(now.year, now.month, 1)

    # End of month
    if start_dt.month == 12:
        end_dt = datetime(start_dt.year + 1, 1, 1)
    else:
        end_dt = datetime(start_dt.year, start_dt.month + 1, 1)

    logs_result = await db.execute(
        select(ConsumptionLog).where(
            ConsumptionLog.consumed_at >= start_dt,
            ConsumptionLog.consumed_at < end_dt,
        ).order_by(ConsumptionLog.consumed_at.asc())
    )
    logs = logs_result.scalars().all()

    # Weekly buckets within the month
    weeks: dict = {}
    person_totals: dict = {}
    for log in logs:
        week_num = log.consumed_at.strftime("%Y-W%V")
        if week_num not in weeks:
            weeks[week_num] = {}
        p = log.person
        if p not in weeks[week_num]:
            weeks[week_num][p] = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
        weeks[week_num][p]["calories"] += log.calories or 0
        weeks[week_num][p]["protein"] += log.protein or 0
        weeks[week_num][p]["carbs"] += log.carbs or 0
        weeks[week_num][p]["fat"] += log.fat or 0
        if p not in person_totals:
            person_totals[p] = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "items": 0}
        person_totals[p]["calories"] += log.calories or 0
        person_totals[p]["protein"] += log.protein or 0
        person_totals[p]["carbs"] += log.carbs or 0
        person_totals[p]["fat"] += log.fat or 0
        person_totals[p]["items"] += 1

    discarded_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.status == "discarded",
            InventoryItem.consumed_date >= start_dt,
            InventoryItem.consumed_date < end_dt,
        )
    )
    discarded_count = len(discarded_result.scalars().all())

    return {
        "month": start_dt.strftime("%Y-%m"),
        "weeks": weeks,
        "person_totals": person_totals,
        "discarded_count": discarded_count,
        "total_logs": len(logs),
    }
