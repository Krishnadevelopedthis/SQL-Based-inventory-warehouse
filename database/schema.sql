-- =========================================================
-- INVENTORY & WAREHOUSE MANAGEMENT - FULL SCHEMA
-- =========================================================

-- Run: psql -U postgres
-- CREATE DATABASE inventory_db;
-- \c inventory_db
-- Then run this whole file: \i schema.sql

DROP TABLE IF EXISTS low_stock_alerts CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;

-- =========================================================
-- TABLES
-- =========================================================

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    contact     VARCHAR(100),
    email       VARCHAR(100),
    address     VARCHAR(200),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    product_id     SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    sku            VARCHAR(50) UNIQUE,
    quantity       INT DEFAULT 0 CHECK (quantity >= 0),
    reorder_level  INT DEFAULT 10,
    price          NUMERIC(10,2) NOT NULL,
    supplier_id    INT REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE purchases (
    purchase_id        SERIAL PRIMARY KEY,
    product_id         INT REFERENCES products(product_id) ON DELETE CASCADE,
    supplier_id        INT REFERENCES suppliers(supplier_id),
    quantity_purchased INT NOT NULL CHECK (quantity_purchased > 0),
    unit_cost          NUMERIC(10,2),
    purchase_date      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sales (
    sale_id       SERIAL PRIMARY KEY,
    product_id    INT REFERENCES products(product_id) ON DELETE CASCADE,
    customer_name VARCHAR(100),
    quantity_sold INT NOT NULL CHECK (quantity_sold > 0),
    unit_price    NUMERIC(10,2),
    sale_date     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE low_stock_alerts (
    alert_id       SERIAL PRIMARY KEY,
    product_id     INT REFERENCES products(product_id) ON DELETE CASCADE,
    severity       VARCHAR(20) DEFAULT 'LOW_STOCK',  -- 'LOW_STOCK' or 'OUT_OF_STOCK'
    alert_message  TEXT,
    resolved       BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- FUNCTIONS
-- =========================================================

-- Returns 'OUT_OF_STOCK', 'LOW_STOCK', or 'OK' for a given product
-- Rule: quantity = 0            -> OUT_OF_STOCK
--       0 < quantity <= reorder -> LOW_STOCK
--       quantity > reorder      -> OK
CREATE OR REPLACE FUNCTION get_stock_status(p_id INT)
RETURNS TEXT AS $$
DECLARE
    qty INT;
    reorder INT;
BEGIN
    SELECT quantity, reorder_level INTO qty, reorder
    FROM products WHERE product_id = p_id;

    IF NOT FOUND THEN
        RETURN 'NOT_FOUND';
    ELSIF qty = 0 THEN
        RETURN 'OUT_OF_STOCK';
    ELSIF qty <= reorder THEN
        RETURN 'LOW_STOCK';
    ELSE
        RETURN 'OK';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Returns total inventory value (quantity * price)
CREATE OR REPLACE FUNCTION get_inventory_value()
RETURNS NUMERIC AS $$
DECLARE
    total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(quantity * price), 0) INTO total FROM products;
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- TRIGGERS
-- =========================================================

-- Keep updated_at fresh whenever a product row changes
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION trg_set_updated_at();

-- Auto-insert a low stock alert whenever quantity drops to/under reorder_level.
-- Severity is OUT_OF_STOCK when quantity hits exactly 0, otherwise LOW_STOCK.
CREATE OR REPLACE FUNCTION trg_check_low_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_severity VARCHAR(20);
BEGIN
    IF NEW.quantity <= NEW.reorder_level THEN
        v_severity := CASE WHEN NEW.quantity = 0 THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END;

        INSERT INTO low_stock_alerts(product_id, severity, alert_message)
        VALUES (NEW.product_id, v_severity,
                CASE WHEN NEW.quantity = 0
                     THEN '"' || NEW.name || '" is OUT OF STOCK (0 units)'
                     ELSE '"' || NEW.name || '" is LOW: ' || NEW.quantity ||
                          ' left (reorder level: ' || NEW.reorder_level || ')'
                END);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_stock_change
AFTER UPDATE OF quantity ON products
FOR EACH ROW
WHEN (NEW.quantity <= NEW.reorder_level AND NEW.quantity IS DISTINCT FROM OLD.quantity)
EXECUTE FUNCTION trg_check_low_stock();

-- Also catch products that are already low the moment they're created
CREATE TRIGGER after_stock_insert
AFTER INSERT ON products
FOR EACH ROW
WHEN (NEW.quantity <= NEW.reorder_level)
EXECUTE FUNCTION trg_check_low_stock();

-- =========================================================
-- STORED PROCEDURES
-- =========================================================

-- Record a sale as a single transaction: deduct stock + log sale (with customer name).
-- If stock is insufficient, the whole operation is rolled back.
CREATE OR REPLACE PROCEDURE process_sale(
    p_product_id INT,
    p_qty INT,
    p_customer_name VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    current_qty INT;
    unit_price NUMERIC;
BEGIN
    SELECT quantity, price INTO current_qty, unit_price
    FROM products WHERE product_id = p_product_id
    FOR UPDATE;  -- lock the row during the transaction

    IF current_qty IS NULL THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    IF current_qty < p_qty THEN
        RAISE EXCEPTION 'Insufficient stock: only % available', current_qty;
    END IF;

    UPDATE products
    SET quantity = quantity - p_qty
    WHERE product_id = p_product_id;

    INSERT INTO sales(product_id, customer_name, quantity_sold, unit_price)
    VALUES (p_product_id, p_customer_name, p_qty, unit_price);
END;
$$;

-- Record a purchase (restock) as a transaction: add stock + log purchase
CREATE OR REPLACE PROCEDURE process_purchase(
    p_product_id INT,
    p_supplier_id INT,
    p_qty INT,
    p_unit_cost NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE products
    SET quantity = quantity + p_qty
    WHERE product_id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    INSERT INTO purchases(product_id, supplier_id, quantity_purchased, unit_cost)
    VALUES (p_product_id, p_supplier_id, p_qty, p_unit_cost);
END;
$$;

-- =========================================================
-- CURSOR EXAMPLE
-- Loops through all products and builds a low-stock report,
-- inserting one alert row per low-stock item not already alerted today.
-- =========================================================

CREATE OR REPLACE PROCEDURE generate_low_stock_report()
LANGUAGE plpgsql
AS $$
DECLARE
    product_cursor CURSOR FOR
        SELECT product_id, name, quantity, reorder_level FROM products;
    rec RECORD;
    already_alerted BOOLEAN;
    v_severity VARCHAR(20);
BEGIN
    OPEN product_cursor;
    LOOP
        FETCH product_cursor INTO rec;
        EXIT WHEN NOT FOUND;

        IF rec.quantity <= rec.reorder_level THEN
            SELECT EXISTS (
                SELECT 1 FROM low_stock_alerts
                WHERE product_id = rec.product_id
                AND created_at::date = CURRENT_DATE
            ) INTO already_alerted;

            IF NOT already_alerted THEN
                v_severity := CASE WHEN rec.quantity = 0 THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END;
                INSERT INTO low_stock_alerts(product_id, severity, alert_message)
                VALUES (rec.product_id, v_severity,
                        CASE WHEN rec.quantity = 0
                             THEN '"' || rec.name || '" is OUT OF STOCK (0 units)'
                             ELSE '"' || rec.name || '" is LOW: ' || rec.quantity || ' units left'
                        END);
            END IF;
        END IF;
    END LOOP;
    CLOSE product_cursor;
END;
$$;

-- =========================================================
-- SAMPLE DATA
-- =========================================================

INSERT INTO suppliers (name, contact, email, address) VALUES
('Acme Supplies', '555-1000', 'sales@acme.com', '123 Warehouse Rd'),
('Global Parts Co', '555-2000', 'contact@globalparts.com', '45 Industry Ave');

INSERT INTO products (name, sku, quantity, reorder_level, price, supplier_id) VALUES
('Steel Bolts (100pk)', 'SKU-001', 50, 20, 12.99, 1),
('Hydraulic Hose 2m', 'SKU-002', 8, 15, 45.50, 2),
('Safety Gloves (pair)', 'SKU-003', 200, 50, 4.25, 1);

-- Example calls (uncomment to test manually in psql):
-- CALL process_sale(1, 5, 'Walk-in Customer');
-- CALL process_purchase(2, 2, 30, 40.00);
-- CALL generate_low_stock_report();
-- SELECT get_stock_status(2);
-- SELECT get_inventory_value();
