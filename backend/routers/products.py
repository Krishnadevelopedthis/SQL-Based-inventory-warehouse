from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import Product
from schemas import ProductCreate, ProductUpdate, ProductOut
from typing import List

router = APIRouter()


@router.get("/", response_model=List[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/", response_model=ProductOut)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    new_product = Product(**product.dict())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, updates: ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for field, value in updates.dict(exclude_unset=True).items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()

    # If the table is now empty, restart the ID sequence from 1 so the next
    # product created starts back at ID 1 instead of continuing to climb.
    remaining = db.query(Product).count()
    if remaining == 0:
        db.execute(text("ALTER SEQUENCE products_product_id_seq RESTART WITH 1"))
        db.commit()

    return {"message": "Product deleted"}


@router.get("/{product_id}/status")
def product_stock_status(product_id: int, db: Session = Depends(get_db)):
    """Calls the get_stock_status() SQL function."""
    result = db.execute(
        text("SELECT get_stock_status(:pid)"), {"pid": product_id}
    ).scalar()
    if result == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Product not found")
    return {"product_id": product_id, "status": result}


@router.get("/reports/inventory-value")
def inventory_value(db: Session = Depends(get_db)):
    """Calls the get_inventory_value() SQL function."""
    result = db.execute(text("SELECT get_inventory_value()")).scalar()
    return {"total_inventory_value": float(result)}
