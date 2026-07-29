from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import products, suppliers, purchases, sales, stock, reports

app = FastAPI(
    title="IntelliSense Warehouse API",
    description="Manage products, suppliers, purchases, sales, and stock alerts",
    version="2.0.0",
)

# Allow the HTML/JS frontend (served from a different origin/port) to call this API.
# Restrict allow_origins to your actual frontend URL in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router, prefix="/products", tags=["Products"])
app.include_router(suppliers.router, prefix="/suppliers", tags=["Suppliers"])
app.include_router(purchases.router, prefix="/purchases", tags=["Purchases"])
app.include_router(sales.router, prefix="/sales", tags=["Sales"])
app.include_router(stock.router, prefix="/stock", tags=["Stock & Alerts"])
app.include_router(reports.router, prefix="/reports", tags=["Reports"])


@app.get("/")
def root():
    return {"message": "IntelliSense Warehouse API is running. Visit /docs for the interactive API explorer."}
