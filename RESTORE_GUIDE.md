# GO GRAND - Database Disaster Recovery & Restore Guide

This guide describes how to download a timestamped PostgreSQL backup from Google Drive and restore it into Supabase PostgreSQL to restore 5+ years of customer and vehicle history without data loss.

---

## 1. Architecture & Backup Overview

- **Live Database**: Supabase PostgreSQL (`public.jobs`, `public.staff_profiles`, `public.service_sections`, `public.app_settings`).
- **Disaster Recovery Target**: Google Drive (Automated daily SQL dumps: `GO-GRAND-DB-YYYY-MM-DD.sql`).
- **Data Integrity**: Every backup file is verified with SHA-256 checksum, non-zero byte size validation, and table-level transactional statements.

---

## 2. Step-by-Step Restoration Procedure

### Step 1: Download the Latest Valid Backup from Google Drive
1. Open your configured **Google Drive Backup Folder** (or check `server/backups/`).
2. Download the latest valid `.sql` backup file (e.g., `GO-GRAND-DB-2026-09-18.sql`).
3. *(Optional)* Verify the SHA-256 checksum locally:
   ```bash
   # Windows PowerShell
   Get-FileHash -Algorithm SHA256 ./GO-GRAND-DB-2026-09-18.sql

   # Linux / macOS
   sha256sum GO-GRAND-DB-2026-09-18.sql
   ```

---

### Step 2: Restore into Supabase Database

#### Method A: Via Supabase Dashboard SQL Editor (Fastest & Simplest)
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project (`go-grand`).
3. Navigate to the **SQL Editor** on the left menu.
4. Open the downloaded `GO-GRAND-DB-YYYY-MM-DD.sql` file in any text editor, copy its entire contents, and paste it into the SQL Editor.
5. Click **Run**.
6. All tables (`jobs`, `staff_profiles`, `service_sections`, `app_settings`) will be created if needed and updated with all historical rows.

#### Method B: Via Standard PostgreSQL CLI (`psql`)
If you have PostgreSQL client tools installed:
```bash
# Connect using your Supabase database connection string (from Settings -> Database)
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" -f ./GO-GRAND-DB-2026-09-18.sql
```

---

### Step 3: Verify Data Integrity After Restoration

Run the following verification query in the Supabase SQL Editor:
```sql
SELECT 'jobs' AS table_name, count(*) AS total_records FROM public.jobs
UNION ALL
SELECT 'staff_profiles', count(*) FROM public.staff_profiles
UNION ALL
SELECT 'service_sections', count(*) FROM public.service_sections
UNION ALL
SELECT 'app_settings', count(*) FROM public.app_settings;
```

Confirm that:
1. All historical customer and vehicle records are populated.
2. Row Level Security (RLS) policies are active.
3. Indexes (`idx_jobs_vehicle_number`, `idx_jobs_created_at`, `idx_jobs_phone_number`) are present.

---

### Step 4: Reconnect Application

1. Open the live GO GRAND application ([https://go-grand.vercel.app](https://go-grand.vercel.app)).
2. Log in with Owner or Staff credentials.
3. Open **Total Vehicles** and search for past vehicles (e.g. `TS08EQ1234`).
4. Confirm historical jobs, invoices, and prices load immediately.

---

## 3. Google Drive Configuration Variables

To enable automated uploads to your Google Drive folder, configure these environment variables in your server environment (e.g. Render Dashboard -> Environment):

| Environment Variable | Description |
| :--- | :--- |
| `GOOGLE_DRIVE_FOLDER_ID` | The ID of the Google Drive folder where backups will be stored. |
| `GOOGLE_DRIVE_CLIENT_ID` | Google OAuth2 Client ID from Google Cloud Console. |
| `GOOGLE_DRIVE_CLIENT_SECRET`| Google OAuth2 Client Secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN`| Long-lived OAuth2 Refresh Token with `https://www.googleapis.com/auth/drive.file` scope. |

*Note: If Google Drive credentials are not yet configured, the system still automatically creates and stores local timestamped backups in `server/backups/` under the 30-day retention policy.*
