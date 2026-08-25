/*
# Add user_id and switch to owner-scoped RLS

1. Changes
- Add nullable `user_id` column to `items` and `connections`, defaulting to auth.uid(), referencing auth.users with cascade delete.
- Drop all existing shared (anon) policies on both tables.
- Create a single FOR ALL policy per table scoped to authenticated users owning the row.

2. Security
- RLS remains enabled on both tables.
- Only authenticated users can access their own rows (auth.uid() = user_id) for all operations.
- anon role has no policies, so anon access is fully blocked.

3. Important Notes
- Existing rows get user_id = NULL and will be inaccessible to any authenticated user (no owner). This is expected when converting from shared to per-user data.
- Email confirmation is disabled at the project level so sign-up works immediately in development.
*/

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_items" ON public.items;
DROP POLICY IF EXISTS "shared_insert_items" ON public.items;
DROP POLICY IF EXISTS "shared_update_items" ON public.items;
DROP POLICY IF EXISTS "shared_delete_items" ON public.items;

DROP POLICY IF EXISTS "shared_select_connections" ON public.connections;
DROP POLICY IF EXISTS "shared_insert_connections" ON public.connections;
DROP POLICY IF EXISTS "shared_update_connections" ON public.connections;
DROP POLICY IF EXISTS "shared_delete_connections" ON public.connections;

CREATE POLICY "items_owner_all" ON public.items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "connections_owner_all" ON public.connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
