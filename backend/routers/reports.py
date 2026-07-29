from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    total_products = db.execute(text("SELECT COUNT(*) FROM products")).scalar()
    total_suppliers = db.execute(text("SELECT COUNT(*) FROM suppliers")).scalar()
    total_value = db.execute(text("SELECT get_inventory_value()")).scalar()
    low_stock_count = db.execute(
        text("SELECT COUNT(*) FROM products WHERE quantity <= reorder_level")
    ).scalar()
    total_sales_30d = db.execute(
        text("SELECT COALESCE(SUM(quantity_sold * unit_price),0) FROM sales WHERE sale_date >= NOW() - INTERVAL '30 days'")
    ).scalar()

    return {
        "total_products": total_products,
        "total_suppliers": total_suppliers,
        "total_inventory_value": float(total_value),
        "low_stock_count": low_stock_count,
        "sales_last_30_days": float(total_sales_30d),
    }


@router.get("/sales-timeseries")
def sales_timeseries(days: int = 30, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT DATE(sale_date) AS day,
                   SUM(quantity_sold) AS units,
                   SUM(quantity_sold * unit_price) AS revenue
            FROM sales
            WHERE sale_date >= NOW() - make_interval(days => :days)
            GROUP BY DATE(sale_date)
            ORDER BY day
        """),
        {"days": days},
    ).fetchall()
    return [{"day": str(r.day), "units": int(r.units), "revenue": float(r.revenue)} for r in rows]


@router.get("/purchases-timeseries")
def purchases_timeseries(days: int = 30, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT DATE(purchase_date) AS day,
                   SUM(quantity_purchased) AS units,
                   SUM(quantity_purchased * unit_cost) AS cost
            FROM purchases
            WHERE purchase_date >= NOW() - make_interval(days => :days)
            GROUP BY DATE(purchase_date)
            ORDER BY day
        """),
        {"days": days},
    ).fetchall()
    return [{"day": str(r.day), "units": int(r.units), "cost": float(r.cost)} for r in rows]


@router.get("/top-products")
def top_products(limit: int = 5, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT p.product_id, p.name, SUM(s.quantity_sold) AS total_sold
            FROM sales s
            JOIN products p ON p.product_id = s.product_id
            GROUP BY p.product_id, p.name
            ORDER BY total_sold DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).fetchall()
    return [{"product_id": r.product_id, "name": r.name, "total_sold": int(r.total_sold)} for r in rows]
