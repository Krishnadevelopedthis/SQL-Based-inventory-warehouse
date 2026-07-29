# IntelliSense Warehouse

Stack: **PostgreSQL** (triggers, functions, procedures, cursor) + **FastAPI** (Python backend) + **HTML/Tailwind/JS** (CMS-style dashboard frontend).

The frontend is a single-page admin panel: a fixed sidebar (Dashboard, Products,
Suppliers, Purchases, Sales, Stock Alerts, Reports), a responsive layout that
collapses the sidebar into a slide-over menu on mobile/tablet, live charts
(Chart.js) on the Dashboard and Reports pages, data tables with delete actions,
and toast notifications instead of browser alerts.

## 1. Set up PostgreSQL

```bash
# Open psql
psql -U postgres

# Inside psql:
CREATE DATABASE inventory_db;
\c inventory_db
\i database/schema.sql
```

This creates all tables, the `get_stock_status()` / `get_inventory_value()` functions,
the `after_stock_change` and `products_updated_at` triggers, the `process_sale()` /
`process_purchase()` transactional procedures, and the cursor-based
`generate_low_stock_report()` procedure — plus a few sample rows.

## 2. Set up the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Edit `database.py` and set your real Postgres password:

```python
DATABASE_URL = "postgresql://postgres:yourpassword@localhost:5432/inventory_db"
```

Run the API:

```bash
uvicorn main:app --reload
```

- API root: http://localhost:8000
- Interactive docs (Swagger UI): http://localhost:8000/docs

Test a couple of endpoints there first, before touching the frontend.

## 3. Run the frontend

The frontend is static — no build step. Easiest way to serve it (avoids
browser file:// CORS quirks):

```bash
cd frontend
python -m http.server 5500
```

Then open http://localhost:5500 in your browser. It calls the API at
`http://localhost:8000` (set in `js/app.js` as `API_URL` — change this if you
deploy the backend elsewhere).

CORS is already enabled on the backend (`main.py`) so the two different ports
can talk to each other.

## 4. What maps to which SQL concept

| SQL concept        | Where it lives                                              |
|---------------------|--------------------------------------------------------------|
| Trigger              | `after_stock_change`, `products_updated_at` in `schema.sql` |
| Function              | `get_stock_status()`, `get_inventory_value()`               |
| Stored procedure      | `process_sale()`, `process_purchase()`                       |
| Transaction           | Inside `process_sale`/`process_purchase` (row lock + rollback on error) |
| Cursor                | `generate_low_stock_report()`                                |

## 6. Reports endpoints (power the Dashboard & Reports pages)

- `GET /reports/summary` — product/supplier counts, total inventory value, low stock count, 30-day sales
- `GET /reports/sales-timeseries?days=30` — daily units sold + revenue
- `GET /reports/purchases-timeseries?days=30` — daily units purchased + cost
- `GET /reports/top-products?limit=5` — best sellers by quantity

## 7. Fixes applied (v2)

If you already ran the old `schema.sql` and have data you don't want to lose,
run `database/migration.sql` instead of re-running `schema.sql` (which drops
all tables). It applies all of the fixes below on top of your existing data.

| Problem reported | Fix |
|---|---|
| Deleted product IDs never got reused, so new IDs kept climbing | `DELETE /products/{id}` now restarts the ID sequence at 1 once the table is fully empty. Note: IDs are still **not** reused while other rows remain — reusing them mid-table would corrupt old purchases/sales history that reference those IDs by foreign key, so this only resets on a fully empty table. |
| Total inventory value at top-right didn't match what looked like the "sum" of products | The Products table now shows a **Total Value** column per row (qty × price) and a footer row that sums to the exact same number shown in the topbar — both come from the same formula (`SUM(quantity * price)`), so they'll always agree. |
| Supplier ID wasn't visible when adding a supplier, but Purchases needed it | Purchases and Sales now use **dropdown selects** (populated from your actual Products/Suppliers) instead of raw ID number fields — you pick by name, no need to remember or type IDs. |
| No total price shown for products/sales/purchases | Added a **Total** column everywhere: Products (qty × unit price), Purchases (qty × unit cost), Sales (qty × unit price). |
| "Sales last 30 days" and "Sales vs Purchases" charts appeared empty | This happens when there simply aren't any sales/purchases recorded yet in that window — the charts now show a clear "No sales recorded..." message instead of a blank canvas so it's obvious it's a data issue, not a bug. Record a sale/purchase and reload the page to see it populate. |
| Sales section had no way to record who you sold to | Added a required **Customer / buyer name** field to the sale form, stored in `sales.customer_name`, and shown in the Sales table. |
| Low stock alert logic was unclear | Alerts now distinguish two severities: **Low Stock** (quantity ≤ reorder level) and **Out of Stock** (quantity = 0), shown with different colored badges. Alerts fire automatically via triggers on both `UPDATE` (a sale reduces stock) and `INSERT` (a new product created already below its reorder level) — plus you can run the cursor-based report any time to sweep for anything missed. |
| Reports charts (Sales vs Purchases, Revenue Trend) showed nothing | Same root cause as above — no data in the last 30 days. Now shows an explicit empty-state message instead of a blank chart. |


## 5. Suggested next endpoints to add yourself

- `GET /products/{id}/history` — join sales + purchases for one product
- Pagination on `GET /products/`
- JWT auth for login-protected routes
