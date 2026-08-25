/*
# Add card_type column to items table

1. Changes
- Adds a `card_type` text column to the `items` table.
- NOT NULL, defaults to 'note' so every existing card becomes 'note'.
- Allowed values: 'note', 'decision', 'option', 'assumption', 'risk', 'evidence'.
- A CHECK constraint enforces the allowed values.
2. Security
- No RLS or policy changes — the column inherits the existing items table policies.
3. Important notes
- No existing columns are altered, renamed or dropped.
- Existing cards keep their current appearance because 'note' is the default
  and 'note' renders exactly as cards do today (no icon, no accent bar).
*/

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'note';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_card_type_check'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_card_type_check
      CHECK (card_type IN ('note', 'decision', 'option', 'assumption', 'risk', 'evidence'));
  END IF;
END $$;
