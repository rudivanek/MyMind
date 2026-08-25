/*
# Add is_favorite to maps

1. Changes
- Add a new column `is_favorite` (boolean, NOT NULL, default false) to the `maps` table.
- Backfill is unnecessary because the column has a default of false.
- No existing column is altered, renamed, or dropped.
- The cards (items) and edges (connections) tables are not touched.

2. Security
- No RLS policy changes. The existing owner-scoped policies on maps already
  govern UPDATE, so authenticated owners can toggle is_favorite on their own
  maps without any additional policy.

3. Notes
- The column is added with IF NOT EXISTS so the migration is idempotent and
  safe to re-run after a timeout.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maps' AND column_name = 'is_favorite'
  ) THEN
    ALTER TABLE maps ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;
  END IF;
END $$;