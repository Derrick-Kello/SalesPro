-- Import apparel products (CP = costPrice, SP = selling price / price).
-- Run: psql $DATABASE_URL -f scripts/import-apparel-products.sql
--   or: npx prisma db execute --file scripts/import-apparel-products.sql

WITH new_products AS (
  INSERT INTO products (name, category, price, "costPrice", "isActive", "createdAt", "updatedAt")
  VALUES
    ('Plain Shirt', 'Apparel', 150.00, 70.00, true, NOW(), NOW()),
    ('Office Trouser', 'Apparel', 180.00, 60.00, true, NOW(), NOW()),
    ('Dinner Shirt', 'Apparel', 180.00, 80.00, true, NOW(), NOW()),
    ('Kaftan', 'Apparel', 500.00, 120.00, true, NOW(), NOW()),
    ('Turtle', 'Apparel', 150.00, 40.00, true, NOW(), NOW()),
    ('Wolden Shorts', 'Apparel', 150.00, 60.00, true, NOW(), NOW()),
    ('Vest', 'Apparel', 150.00, 30.00, true, NOW(), NOW()),
    ('Sweater', 'Apparel', 220.00, 60.00, true, NOW(), NOW()),
    ('Hoodie', 'Apparel', 250.00, 80.00, true, NOW(), NOW()),
    ('Joggers', 'Apparel', 180.00, 60.00, true, NOW(), NOW()),
    ('Jeans', 'Apparel', 180.00, 100.00, true, NOW(), NOW()),
    ('Khaki', 'Apparel', 150.00, 75.00, true, NOW(), NOW()),
    ('Short Sleeves', 'Apparel', 150.00, 60.00, true, NOW(), NOW()),
    ('Long Sleeves', 'Apparel', 150.00, 60.00, true, NOW(), NOW()),
    ('Summer Shorts', 'Apparel', 80.00, 40.00, true, NOW(), NOW()),
    ('Net Shirt', 'Apparel', 150.00, 50.00, true, NOW(), NOW()),
    ('Vintage', 'Apparel', 150.00, 60.00, true, NOW(), NOW()),
    ('Round Neck', 'Apparel', 150.00, 50.00, true, NOW(), NOW()),
    ('Special Club T', 'Apparel', 180.00, 70.00, true, NOW(), NOW()),
    ('Club T', 'Apparel', 150.00, 50.00, true, NOW(), NOW()),
    ('Slippers', 'Footwear', 300.00, 130.00, true, NOW(), NOW()),
    ('Loafer', 'Footwear', 300.00, 130.00, true, NOW(), NOW()),
    ('Half Shoes', 'Footwear', 300.00, 130.00, true, NOW(), NOW()),
    ('Timberland Shoe', 'Footwear', 400.00, 180.00, true, NOW(), NOW())
  RETURNING id
)
INSERT INTO inventory ("productId", quantity, "lowStockAlert", "updatedAt")
SELECT id, 0, 10, NOW()
FROM new_products;
