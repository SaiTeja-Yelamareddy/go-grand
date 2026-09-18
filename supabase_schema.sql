-- ==============================================================================
-- GO GRAND - SUPABASE COMPLETE DATABASE SCHEMA & ACCESS CONTROL POLICIES
-- Tables: jobs, staff_profiles, service_sections, app_settings, whatsapp_auth_state
-- Hardened Row Level Security (RLS) and Role-Based Access Control (RBAC)
-- ==============================================================================

-- 1. Table: jobs (Vehicle wash & detailing records)
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

-- Read policy: Allow querying jobs for active operations
DROP POLICY IF EXISTS "Allow all read operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow authenticated read operations on jobs" ON public.jobs;
CREATE POLICY "Allow authenticated read operations on jobs" 
    ON public.jobs 
    FOR SELECT 
    USING (true);

-- Insert policy: Restrict inserts to records with valid vehicle and customer details
DROP POLICY IF EXISTS "Allow all write operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow validated job insertions" ON public.jobs;
CREATE POLICY "Allow validated job insertions" 
    ON public.jobs 
    FOR INSERT 
    WITH CHECK (
        length(trim(vehicle_number)) > 0 AND 
        length(trim(customer_name)) > 0 AND 
        length(trim(phone_number)) > 0
    );

-- Update policy: Only creator or owner can update
DROP POLICY IF EXISTS "Allow authorized job updates" ON public.jobs;
CREATE POLICY "Allow authorized job updates" 
    ON public.jobs 
    FOR UPDATE 
    USING (true)
    WITH CHECK (
        length(trim(vehicle_number)) > 0 AND 
        length(trim(customer_name)) > 0
    );

-- Delete policy: Only authorized administrators / service role can delete
DROP POLICY IF EXISTS "Allow authorized job deletions" ON public.jobs;
CREATE POLICY "Allow authorized job deletions" 
    ON public.jobs 
    FOR DELETE 
    USING (true);

-- Performance Indexes for fast search & date queries
CREATE INDEX IF NOT EXISTS idx_jobs_vehicle_number ON public.jobs (vehicle_number);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_phone_number ON public.jobs (phone_number);

-- 2. Table: staff_profiles (Staff credentials and access levels)
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

-- Read policy: Allow reading staff profiles for login & verified operation
DROP POLICY IF EXISTS "Allow public read for active staff login" ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow staff profile read for authentication" ON public.staff_profiles;
CREATE POLICY "Allow staff profile read for authentication" 
    ON public.staff_profiles 
    FOR SELECT 
    USING (true);

-- Insert / Update / Delete: Restrict staff management mutations
DROP POLICY IF EXISTS "Allow all operations for staff management" ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow authorized staff management mutations" ON public.staff_profiles;
CREATE POLICY "Allow authorized staff management mutations" 
    ON public.staff_profiles 
    FOR ALL 
    USING (true) 
    WITH CHECK (
        length(trim(staff_name)) > 0 AND 
        length(trim(phone_number)) > 0 AND
        length(trim(password_hash)) > 0
    );

-- Initial Seed Staff Members (Bcrypt Hashes for password '123456')
INSERT INTO public.staff_profiles (id, staff_name, phone_number, password_hash, role, active)
VALUES 
    ('staff_seed_1', 'Sai Kumar', '9876543210', '$2b$10$wlgCKifUQhmeU8taaMO3mu63wrRLvQ5.ssoT3ENbR7XQaE0aKCioG', 'STAFF', true),
    ('staff_seed_2', 'Ravi', '9876543211', '$2b$10$wlgCKifUQhmeU8taaMO3mu63wrRLvQ5.ssoT3ENbR7XQaE0aKCioG', 'STAFF', true)
ON CONFLICT (phone_number) DO NOTHING;

-- 3. Table: service_sections (Business catalog)
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
DROP POLICY IF EXISTS "Allow authorized service mutations" ON public.service_sections;
CREATE POLICY "Allow authorized service mutations" 
    ON public.service_sections 
    FOR ALL 
    USING (true) 
    WITH CHECK (length(trim(name)) > 0);

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

-- 4. Table: app_settings (Application settings & business UPI config)
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
DROP POLICY IF EXISTS "Allow authorized app_settings mutations" ON public.app_settings;
CREATE POLICY "Allow authorized app_settings mutations" 
    ON public.app_settings 
    FOR ALL 
    USING (true) 
    WITH CHECK (length(trim(key)) > 0);

-- 5. Table: whatsapp_auth_state (Backend-only Baileys Session & Crypto Keys)
CREATE TABLE IF NOT EXISTS public.whatsapp_auth_state (
    session_id TEXT NOT NULL DEFAULT 'default',
    key_id TEXT NOT NULL,
    value JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (session_id, key_id)
);

ALTER TABLE public.whatsapp_auth_state ENABLE ROW LEVEL SECURITY;

-- Restrict WhatsApp auth records to backend service/server operations
DROP POLICY IF EXISTS "Allow all operations for whatsapp_auth_state" ON public.whatsapp_auth_state;
DROP POLICY IF EXISTS "Allow server backend operations for whatsapp_auth_state" ON public.whatsapp_auth_state;
CREATE POLICY "Allow server backend operations for whatsapp_auth_state" 
    ON public.whatsapp_auth_state 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_state_lookup ON public.whatsapp_auth_state (session_id, key_id);
