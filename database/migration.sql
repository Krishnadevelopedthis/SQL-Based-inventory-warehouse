-- =========================================================
-- MIGRATION: apply the fixes on top of an EXISTING database
-- (use this instead of schema.sql if you already have data
-- you don't want to lose — schema.sql DROPs all tables)
-- =========================================================
-- Run: psql -U postgres -d inventory_db -f migration.sql

-- 1. Add customer_name to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);

-- 2. Add severity to low_stock_alerts
ALTER TABLE low_stock_alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'LOW_STOCK';

-- 3. Replace get_stock_status() to distinguish OUT_OF_STOCK vs LOW_STOCK
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

-- 4. Replace trigger function with severity-aware messaging
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

-- 5. Add the AFTER INSERT trigger (catches products created already-low)
DROP TRIGGER IF EXISTS after_stock_insert ON products;
CREATE TRIGGER after_stock_insert
AFTER INSERT ON products
FOR EACH ROW
WHEN (NEW.quantity <= NEW.reorder_level)
EXECUTE FUNCTION trg_check_low_stock();

-- 6. Replace process_sale() to accept a customer name
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
    FOR UPDATE;

    IF current_qty IS NULL THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    IF current_qty < p_qty THEN
        RAISE EXCEPTION 'Insufficient stock: only % available', current_qty;
    END IF;

    UPDATE products SET quantity = quantity - p_qty WHERE product_id = p_product_id;

    INSERT INTO sales(product_id, customer_name, quantity_sold, unit_price)
    VALUES (p_product_id, p_customer_name, p_qty, unit_price);
END;
$$;

-- 7. Replace generate_low_stock_report() cursor procedure with severity support
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
                WHERE product_id = rec.product_id AND created_at::date = CURRENT_DATE
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

-- 8. Reset the products ID sequence to right after the current max ID
--    (run this once now; the app will auto-restart it at 1 whenever the
--    products table becomes fully empty from then on)
SELECT setval('products_product_id_seq', COALESCE((SELECT MAX(product_id) FROM products), 1));
