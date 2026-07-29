from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, TIMESTAMP, Boolean
from sqlalchemy.sql import func
from database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(100))
    email = Column(String(100))
    address = Column(String(200))
    created_at = Column(TIMESTAMP, server_default=func.now())


class Product(Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    sku = Column(String(50), unique=True)
    quantity = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    price = Column(Numeric(10, 2), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())


class Purchase(Base):
    __tablename__ = "purchases"

    purchase_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"))
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    quantity_purchased = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(10, 2))
    purchase_date = Column(TIMESTAMP, server_default=func.now())


class Sale(Base):
    __tablename__ = "sales"

    sale_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"))
    customer_name = Column(String(100))
    quantity_sold = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2))
    sale_date = Column(TIMESTAMP, server_default=func.now())


class LowStockAlert(Base):
    __tablename__ = "low_stock_alerts"

    alert_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"))
    severity = Column(String(20), default="LOW_STOCK")
    alert_message = Column(String)
    resolved = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
