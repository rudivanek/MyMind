/*
# Add maps table and map_id to items and connections

1. New Tables
- `maps` — stores a named map (board) owned by a user.
  - `id` uuid primary key default gen_random_uuid()
  - `user_id` uuid not null references auth.users(id) on delete cascade, default auth.uid()
  - `name` text not null default 'Untitled map'
  - `created_at` timestamptz not null default now()
  - `updated_at` timestamptz not null default now()

2. Modified Tables
- `items` — add `map_id` uuid referencing maps(id) on delete cascade, indexed.
- `connections` — add `map_id` uuid referencing maps(id) on delete cascade, indexed.

3. Data Migration (in order)
  a. Create the maps table.
  b. Add map_id as NULLABLE to items and connections.
  c. For each distinct user_id in items, insert one map named 'My board' and set map_id on all of that user's existing items and connections to it.
  d. Only then set map_id to NOT NULL on items and connections.

4. Security
- RLS enabled on maps with a FOR ALL TO authenticated policy using auth.uid() = user_id, matching the existing items and connections policies.
- RLS remains enabled on items and connections (no change to their existing policies).

5. Important Notes
- No existing rows are dropped or recreated.
- The maps table, map_id columns, and data backfill all happen in a single migration in the correct order.
- Indexes are added on items.map_id and connections.map_id for efficient per-map queries.
*/

-- Step a: Create the maps table
CREATE TABLE IF NOT EXISTS public.maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'Untitled map',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maps_owner_all" ON public.maps;
CREATE POLICY "maps_owner_all" ON public.maps
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step b: Add map_id as nullable to items and connections
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS map_id uuid REFERENCES public.maps(id) ON DELETE CASCADE;
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS map_id uuid REFERENCES public.maps(id) ON DELETE CASCADE;

-- Step c: For each distinct user_id in items, create one 'My board' map and assign all their items and connections to it
DO $$
DECLARE
  uid RECORD;
  new_map_id uuid;
BEGIN
  FOR uid IN SELECT DISTINCT user_id FROM public.items WHERE user_id IS NOT NULL AND map_id IS NULL LOOP
    INSERT INTO public.maps (user_id, name)
    VALUES (uid.user_id, 'My board')
    RETURNING id INTO new_map_id;

    UPDATE public.items SET map_id = new_map_id WHERE user_id = uid.user_id AND map_id IS NULL;
    UPDATE public.connections SET map_id = new_map_id WHERE user_id = uid.user_id AND map_id IS NULL;
  END LOOP;
END $$;

-- Step d: Set map_id to NOT NULL
-- Only enforce NOT NULL after backfill so existing rows survive
ALTER TABLE public.items ALTER COLUMN map_id SET NOT NULL;
ALTER TABLE public.connections ALTER COLUMN map_id SET NOT NULL;

-- Indexes for efficient per-map queries
CREATE INDEX IF NOT EXISTS idx_items_map_id ON public.items (map_id);
CREATE INDEX IF NOT EXISTS idx_connections_map_id ON public.connections (map_id);
