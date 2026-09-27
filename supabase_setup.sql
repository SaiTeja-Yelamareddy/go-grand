-- Supabase Database Setup for Owner Authentication

-- 1. Create owner_profiles table
CREATE TABLE IF NOT EXISTS public.owner_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role = 'owner'),
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id)
);

-- 2. Enable Row Level Security
ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for owner_profiles
-- An owner can only read their own profile
CREATE POLICY "Owners can view own profile" 
  ON public.owner_profiles 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- An owner can update their own profile
CREATE POLICY "Owners can update own profile" 
  ON public.owner_profiles 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Prevent unauthorized creation/deletion via frontend
-- (First owner profile should be created via Supabase Dashboard / SQL editor)
CREATE POLICY "Service role can insert owner profiles" 
  ON public.owner_profiles 
  FOR INSERT 
  WITH CHECK (false); -- Requires service role bypass

CREATE POLICY "Service role can delete owner profiles" 
  ON public.owner_profiles 
  FOR DELETE 
  USING (false); -- Requires service role bypass

-- 4. Review Existing Tables to Ensure Proper Security
-- Below is an example of how you can restrict existing tables to only active owners.
-- For example, to secure the `jobs` table:

-- ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Only active owners can delete jobs"
--   ON public.jobs
--   FOR DELETE
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.owner_profiles 
--       WHERE owner_profiles.user_id = auth.uid() 
--       AND owner_profiles.active = true
--     )
--   );

-- (Apply similar policies to `staff_profiles`, `service_sections`, `app_settings` as required)

-- =========================================================
-- SETUP INSTRUCTIONS FOR FIRST OWNER
-- =========================================================
-- 1. Go to Supabase Dashboard -> Authentication -> Add User.
-- 2. Create a user with your email address and secure password.
-- 3. Copy the 'User UID' of the created user.
-- 4. Run the following SQL query to link the auth user to an owner_profile:
-- 
-- INSERT INTO public.owner_profiles (user_id, name, role, active) 
-- VALUES ('<YOUR_COPIED_USER_UID>', 'Main Owner', 'owner', true);
