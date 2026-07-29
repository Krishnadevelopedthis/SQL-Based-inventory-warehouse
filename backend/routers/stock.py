from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import LowStockAlert
from schemas import AlertOut
from typing import List

router = APIRouter()


@router.get("/alerts", response_model=List[AlertOut])
def list_alerts(db: Session = Depends(get_db)):
    """Alerts here are populated automatically by the DB trigger
    (after_stock_change) whenever a product's quantity drops
    to/below its reorder_level."""
    return db.query(LowStockAlert).order_by(LowStockAlert.created_at.desc()).all()


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(LowStockAlert).filter(LowStockAlert.alert_id == alert_id).first()
    if alert:
        alert.resolved = True
        db.commit()
    return {"message": "Alert resolved"}


@router.post("/generate-report")
def generate_low_stock_report(db: Session = Depends(get_db)):
    """
    Calls the generate_low_stock_report() procedure, which uses a
    CURSOR to loop through every product and insert alerts for any
    that are at/under their reorder level (skipping duplicates for today).
    """
    db.execute(text("CALL generate_low_stock_report()"))
    db.commit()
    return {"message": "Low stock report generated"}
