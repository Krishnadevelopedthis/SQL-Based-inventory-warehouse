from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from database import get_db
from models import Purchase
from schemas import PurchaseCreate, PurchaseOut
from typing import List

router = APIRouter()


@router.get("/", response_model=List[PurchaseOut])
def list_purchases(db: Session = Depends(get_db)):
    return db.query(Purchase).order_by(Purchase.purchase_date.desc()).all()


@router.post("/")
def record_purchase(purchase: PurchaseCreate, db: Session = Depends(get_db)):
    """Calls the process_purchase() stored procedure (adds stock + logs purchase)."""
    try:
        db.execute(
            text("CALL process_purchase(:pid, :sid, :qty, :cost)"),
            {
                "pid": purchase.product_id,
                "sid": purchase.supplier_id,
                "qty": purchase.quantity_purchased,
                "cost": purchase.unit_cost,
            },
        )
        db.commit()
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e.orig))

    return {"message": "Purchase recorded successfully"}
