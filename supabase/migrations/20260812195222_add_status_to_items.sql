/*
# Add status column to items table

1. Changes
- Add nullable `status` text column to the `items` table.
- Allowed values: "todo" | "done" | "question" | "important".
- NULL means no status set (the default for existing rows).
- No check constraint is added — the column is a nullable string like `color`.

2. Existing data
- All existing rows get NULL (no status), which renders as no status marker.
- No data migration needed; ALTER TABLE ... ADD COLUMN defaults to NULL.

3. Security
- No RLS policy changes. The column inherits the existing item-level policies.
*/

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS status text;
