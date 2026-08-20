/*
# Add folders table and folder_id on maps

1. New Tables
- `folders` — user-owned folders that group maps in a nested tree (max 3 levels deep, enforced in the app).
  - `id` uuid primary key default gen_random_uuid()
  - `user_id` uuid not null references auth.users(id) on delete cascade, default auth.uid()
  - `name` text not null default 'New folder'
  - `parent_id` uuid references folders(id) on delete cascade (nullable; null = root level)
  - `created_at` timestamptz not null default now()

2. Modified Tables
- `maps` — add `folder_id` uuid references folders(id) on delete SET NULL, nullable, indexed.
  - A null folder_id means the map sits at the root level (loose map).
  - on delete SET NULL (NOT cascade): deleting a folder never deletes maps by database cascade.
    The app deletes the maps explicitly after user confirmation, so the user always sees the
    confirmation dialog before any maps are removed.

3. Security
- RLS enabled on folders.
- Single `folders_owner_all` policy: FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id), exactly matching the existing maps policy.
- RLS on maps is unchanged (the existing maps_owner_all policy still applies).

4. Important Notes
- No existing rows are dropped or recreated.
- The folders table is created before the maps.folder_id column is added.
- Index on maps.folder_id supports efficient per-folder lookups in the sidebar.
- on delete SET NULL on maps.folder_id means deleting a folder leaves its maps in the database
  (set to root). The app handles explicit map deletion before folder deletion, so the SET NULL
  fallback is a safety net, not the primary deletion path.
*/

-- Step 1: Create the folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'New folder',
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 2: Enable RLS and add the owner policy (matches maps_owner_all exactly)
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folders_owner_all" ON public.folders;
CREATE POLICY "folders_owner_all" ON public.folders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 3: Add folder_id to maps (nullable, on delete SET NULL — NOT cascade)
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;

-- Step 4: Index for efficient per-folder sidebar queries
CREATE INDEX IF NOT EXISTS idx_maps_folder_id ON public.maps (folder_id);
