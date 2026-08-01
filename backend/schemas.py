from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


# ---------- Supplier ----------


class SupplierBase(BaseModel):
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

    @field_validator("contact")
    @classmethod
    def contact_must_be_digits_only(cls, value):
        if value is None or value == "":
            return value
        if not value.isdigit():
            raise ValueError("Contact number must contain digits only (no letters or symbols)")
        if not (7 <= len(value) <= 10):
            raise ValueError("Contact number must be between 7 and 10 digits")
        return value


class SupplierCreate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    supplier_id: int
    created_at: datetime

    class Config:
        orm_mode = True


# ---------- Product ----------
class ProductBase(BaseModel):
    name: str
    sku: Optional[str] = None
    quantity: int = 0
    reorder_level: int = 10
    price: float
    supplier_id: Optional[int] = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    quantity: Optional[int] = None
    reorder_level: Optional[int] = None
    price: Optional[float] = None
    supplier_id: Optional[int] = None


class ProductOut(ProductBase):
    product_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# ---------- Purchase ----------
class PurchaseCreate(BaseModel):
    product_id: int
    supplier_id: int
    quantity_purchased: int
    unit_cost: Decimal


class PurchaseOut(PurchaseCreate):
    purchase_id: int
    purchase_date: datetime

    class Config:
        orm_mode = True


# ---------- Sale ----------
class SaleCreate(BaseModel):
    product_id: int
    customer_name: Optional[str] = None
    quantity_sold: int


class SaleOut(BaseModel):
    sale_id: int
    product_id: int
    customer_name: Optional[str]
    quantity_sold: int
    unit_price: Optional[float]
    sale_date: datetime

    class Config:
        orm_mode = True


# ---------- Alerts ----------
class AlertOut(BaseModel):
    alert_id: int
    product_id: int
    severity: str
    alert_message: str
    resolved: bool
    created_at: datetime

    class Config:
        orm_mode = True
