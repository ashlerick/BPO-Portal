-- "Excellent" and "Good" were redundant: fold existing results into "Good".
UPDATE "inventory_items" SET "condition" = 'good' WHERE "condition" = 'excellent';
UPDATE "inventory_checks" SET "condition" = 'good' WHERE "condition" = 'excellent';
