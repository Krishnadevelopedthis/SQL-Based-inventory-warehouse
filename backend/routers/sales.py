from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from database import get_db
from models import Sale
from schemas import SaleCreate, SaleOut
from typing import List

router = APIRouter()


@router.get("/", response_model=List[SaleOut])
def list_sales(db: Session = Depends(get_db)):
    return db.query(Sale).order_by(Sale.sale_date.desc()).all()


@router.post("/")
def record_sale(sale: SaleCreate, db: Session = Depends(get_db)):
    """
    Calls the process_sale() stored procedure, which:
    - deducts stock
    - logs the sale (with customer name)
    - all inside one DB transaction (rolls back automatically on error)
    """
    try:
        db.execute(
            text("CALL process_sale(:pid, :qty, :customer)"),
            {
                "pid": sale.product_id,
                "qty": sale.quantity_sold,
                "customer": sale.customer_name,
            },
        )
        db.commit()
    except DBAPIError as e:
        db.rollback()
        # surfaces the RAISE EXCEPTION message from the procedure (e.g. "Insufficient stock")
        raise HTTPException(status_code=400, detail=str(e.orig))

    return {"message": "Sale processed successfully"}
