/*
# Create MyMind board tables

1. New Tables
- `items` stores visual note cards, including title, tags, markdown description, due date, position, and accent color.
- `connections` stores directed links between cards, optional comments, and detached label offsets.

2. Relationships
- Each connection references its source and target item and is removed automatically when either item is removed.

3. Security
- Row level security is enabled on both tables.
- This app has no sign-in screen, so the board is intentionally shared through anon and authenticated CRUD policies.

4. Important Notes
- The tables are created idempotently so this migration can be safely retried.
- No existing data is removed or altered.
*/

CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  description text NOT NULL DEFAULT '',
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  color text
);

CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  comment text NOT NULL DEFAULT '',
  label_dx double precision NOT NULL DEFAULT 60,
  label_dy double precision NOT NULL DEFAULT -40
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_items" ON public.items;
CREATE POLICY "shared_select_items" ON public.items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_items" ON public.items;
CREATE POLICY "shared_insert_items" ON public.items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_items" ON public.items;
CREATE POLICY "shared_update_items" ON public.items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_items" ON public.items;
CREATE POLICY "shared_delete_items" ON public.items FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_connections" ON public.connections;
CREATE POLICY "shared_select_connections" ON public.connections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_connections" ON public.connections;
CREATE POLICY "shared_insert_connections" ON public.connections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_connections" ON public.connections;
CREATE POLICY "shared_update_connections" ON public.connections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_connections" ON public.connections;
CREATE POLICY "shared_delete_connections" ON public.connections FOR DELETE TO anon, authenticated USING (true);
