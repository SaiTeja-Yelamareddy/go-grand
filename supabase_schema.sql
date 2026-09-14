-- ==============================================================================
-- GO GRAND - SUPABASE COMPLETE DATABASE SCHEMA
-- Tables: jobs, staff_profiles, service_sections, app_settings
-- This script is idempotent and safe to run multiple times.
-- ==============================================================================

-- 1. Table: jobs (Cleaned & Streamlined)
CREATE TABLE IF NOT EXISTS public.jobs (
    id TEXT PRIMARY KEY,
    vehicle_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    vehicle_name TEXT,
    services JSONB DEFAULT '[]'::jsonb,
    price TEXT NOT NULL,
    discount TEXT,
    bill_no TEXT,
    status TEXT DEFAULT 'pending',
    created_by TEXT,
    created_by_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safely drop unnecessary legacy columns if they exist in existing database
ALTER TABLE public.jobs DROP COLUMN IF EXISTS email;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS address;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS location;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS service;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read operations on jobs" ON public.jobs;
CREATE POLICY "Allow all read operations on jobs" 
    ON public.jobs 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow all write operations on jobs" ON public.jobs;
CREATE POLICY "Allow all write operations on jobs" 
    ON public.jobs 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 2. Table: staff_profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    staff_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF' CHECK (role IN ('OWNER', 'STAFF')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for active staff login" ON public.staff_profiles;
CREATE POLICY "Allow public read for active staff login" 
    ON public.staff_profiles 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow all operations for staff management" ON public.staff_profiles;
CREATE POLICY "Allow all operations for staff management" 
    ON public.staff_profiles 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Initial Seed Staff Members (Passwords: 123456)
INSERT INTO public.staff_profiles (id, staff_name, phone_number, password_hash, role, active)
VALUES 
    ('staff_seed_1', 'Sai Kumar', '9876543210', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'STAFF', true),
    ('staff_seed_2', 'Ravi', '9876543211', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'STAFF', true)
ON CONFLICT (phone_number) DO NOTHING;

-- 3. Table: service_sections
CREATE TABLE IF NOT EXISTS public.service_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    services JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.service_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for service_sections" ON public.service_sections;
CREATE POLICY "Allow public read for service_sections" 
    ON public.service_sections 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow all operations for service_sections" ON public.service_sections;
CREATE POLICY "Allow all operations for service_sections" 
    ON public.service_sections 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Initial Seed Service Sections
INSERT INTO public.service_sections (id, name, services)
VALUES
    ('sec-basic-wash', 'Basic Wash', '[]'::jsonb),
    ('sec-interior-cleaning', 'Interior Cleaning', '[]'::jsonb),
    ('sec-exterior-cleaning', 'Exterior Cleaning', '[]'::jsonb),
    ('sec-full-wash', 'Full Wash', '[]'::jsonb),
    ('sec-wax-polish', 'Wax Polish', '[]'::jsonb),
    ('sec-interior-exterior', 'Interior + Exterior', '[]'::jsonb),
    ('sec-full-detailing', 'Full Detailing', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4. Table: app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for app_settings" ON public.app_settings;
CREATE POLICY "Allow public read for app_settings" 
    ON public.app_settings 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow all operations for app_settings" ON public.app_settings;
CREATE POLICY "Allow all operations for app_settings" 
    ON public.app_settings 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);
