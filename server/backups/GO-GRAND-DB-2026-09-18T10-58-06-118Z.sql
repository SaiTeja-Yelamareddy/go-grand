-- ==============================================================================
-- GO GRAND CAR WASH & DETAILING - FULL DATABASE BACKUP
-- Generated At: 2026-09-18T10:58:06.328Z
-- Records: 6 Jobs, 2 Staff, 1 Sections, 1 Settings
-- ==============================================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';

-- Table: public.jobs
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

INSERT INTO public.jobs (id, vehicle_number, customer_name, phone_number, vehicle_name, services, price, discount, bill_no, status, created_by, created_by_id, created_at) VALUES
  ('job_1788274832531_73pq1', '2288', 'Vwgw', '7989866451', 'Tata Punch', '["Interior Cleaning"]'::jsonb, '2000', '', '', 'pending', 'Owner', 'owner', '2026-09-01T15:00:32.531+00:00'),
  ('job_1789294990977_0zwdq', '1234', 'sonu', '7997480180', 'Tata Punch', '["Exterior Cleaning"]'::jsonb, '500', '', '', 'pending', 'Owner', 'owner', '2026-09-13T10:23:10.977+00:00'),
  ('job_1789312840830_sw340', '1234', 'sonu', '7997480180', 'Tata Punch', '["Exterior Cleaning"]'::jsonb, '500', '', '', 'pending', 'Owner', 'owner', '2026-09-13T15:20:40.83+00:00'),
  ('job_1789665231846_ovuv8', 'SL KJ', 'DG n', '7989866451', 'Renault Kiger', '["Full Foam Wash"]'::jsonb, '500', '', '', 'pending', 'Saaa', 'staff_1789664401388_3uyeb', '2026-09-17T17:13:51.846+00:00'),
  ('job_1789665239535_7ryx2', 'SL KJ', 'DG n', '7989866451', 'Renault Kiger', '["Full Foam Wash"]'::jsonb, '500', '', '', 'pending', 'Saaa', 'staff_1789664401388_3uyeb', '2026-09-17T17:13:59.535+00:00'),
  ('job_1789692392523_gxl6q', 'AP04AB0089', 'Kamal', '7989866451', 'Maruti Suzuki Baleno', '["full wash"]'::jsonb, '500', '', '', 'pending', 'Owner', 'owner', '2026-09-18T00:46:32.523+00:00')
ON CONFLICT (id) DO UPDATE SET vehicle_number = EXCLUDED.vehicle_number, customer_name = EXCLUDED.customer_name, phone_number = EXCLUDED.phone_number, price = EXCLUDED.price, status = EXCLUDED.status;

-- Table: public.staff_profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id TEXT PRIMARY KEY,
    user_id UUID,
    staff_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.staff_profiles (id, user_id, staff_name, phone_number, password_hash, role, active, created_at, updated_at) VALUES
  ('staff_seed_2', NULL, 'Ravi', '9876543211', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'STAFF', TRUE, '2026-09-01T14:48:35.211845+00:00', '2026-09-17T17:01:21.779+00:00'),
  ('staff_1789692222740_mmkvp', NULL, 'Jeet', '8008195435', '16652b6bf9a617c53f80ee4eb9464dee1bff96954650b7a0e276d81de85ad7aa', 'STAFF', TRUE, '2026-09-18T00:43:44.520249+00:00', '2026-09-18T00:43:44.520249+00:00')
ON CONFLICT (phone_number) DO UPDATE SET staff_name = EXCLUDED.staff_name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = EXCLUDED.active;

-- Table: public.service_sections
CREATE TABLE IF NOT EXISTS public.service_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    services JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.service_sections (id, name, services, created_at) VALUES
  ('sec_1789720646385_vljh2', 'full wash', '[{"id":"srv_1789720651510_r1029","name":"gii"}]'::jsonb, '2026-09-18T08:37:25.674173+00:00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, services = EXCLUDED.services;

-- Table: public.app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.app_settings (key, value, updated_at) VALUES
  ('message_templates', '{"sms":"{{shop_name}}: Your {{vehicle_model}} ({{vehicle_number}}) is ready for pickup. Amount: ₹{{amount}}.","vehicleReady":"Hello {{customer_name}}, your {{vehicle_model}} ({{vehicle_number}}) is ready for pickup at {{shop_name}}. Thank you for choosing us.","whatsAppBill":"Hello {{customer_name}}, your bill for {{vehicle_model}} ({{vehicle_number}}) from {{shop_name}} is ₹{{amount}}. Please find your invoice attached.","vehicleReceived":"👋 *Hello Ravi!*\n\nYour *Hyundai Creta* (AP39AB1234) has safely arrived at *GO GRAND Car Wash & Detailing, Murakambattu*. 🚗✨\n\nOur team will take care of your vehicle and keep you updated throughout the service.\n\nWe’ll message you as soon as it’s ready! 💚\n\n*GO GRAND*\nDrive clean. Drive happy."}'::jsonb, '2026-09-18T08:16:38.904+00:00')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
