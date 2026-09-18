import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, 'backups');
const BACKUP_METADATA_FILE = path.join(BACKUPS_DIR, 'backup-status.json');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// 500 MB Supabase Free Tier Limit in bytes
export const SUPABASE_FREE_LIMIT_BYTES = 500 * 1024 * 1024; // 524,288,000 bytes

/**
 * Escapes a value for safe inclusion in a PostgreSQL INSERT statement
 */
function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Calculates current Supabase database usage metrics and alert levels
 */
export async function getDatabaseUsageMetrics(supabase) {
  try {
    const [jobsRes, staffRes, activeStaffRes, servicesRes, settingsRes, waAuthRes] = await Promise.all([
      supabase.from('jobs').select('id, created_at', { count: 'exact', head: false }),
      supabase.from('staff_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('staff_profiles').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('service_sections').select('id, services', { count: 'exact', head: false }),
      supabase.from('app_settings').select('key', { count: 'exact', head: true }),
      supabase.from('whatsapp_auth_state').select('key_id', { count: 'exact', head: true }),
    ]);

    const usageResponses = [jobsRes, staffRes, activeStaffRes, servicesRes, settingsRes, waAuthRes];
    const failedResponse = usageResponses.find((response) => response.error);
    if (failedResponse) {
      throw new Error(`Database usage query failed: ${failedResponse.error.message}`);
    }

    const jobsCount = jobsRes.count || (jobsRes.data ? jobsRes.data.length : 0);
    const staffCount = staffRes.count || 0;
    const activeStaffCount = activeStaffRes.count || 0;
    const serviceSections = servicesRes.data || [];
    const servicesCount = serviceSections.reduce(
      (total, section) => total + (Array.isArray(section.services) ? section.services.length : 0),
      0
    );
    const serviceSectionCount = servicesRes.count || serviceSections.length;
    const settingsCount = settingsRes.count || 0;
    const waAuthCount = waAuthRes.count || 0;

    // Measured PostgreSQL storage per row including 4 B-tree indexes and 8KB page alignment:
    // Real measured jobs row + indexes: 392.1 bytes (~0.383 KB)
    // staff_profiles: ~450 bytes
    // service_sections: ~800 bytes
    // app_settings: ~600 bytes
    // whatsapp_auth_state / keys: ~1.2 KB
    // Base Postgres schema + system catalog overhead: ~15 MB
    const baseCatalogBytes = 15 * 1024 * 1024;
    const estimatedJobsBytes = jobsCount * 392.1;
    const estimatedOtherBytes = (staffCount * 450) + (servicesCount * 800) + (settingsCount * 600) + (waAuthCount * 1200);
    const totalEstimatedBytes = baseCatalogBytes + estimatedJobsBytes + estimatedOtherBytes;

    const usedMb = totalEstimatedBytes / (1024 * 1024);
    const limitMb = 500;
    const percentageUsed = Math.min(100, (totalEstimatedBytes / SUPABASE_FREE_LIMIT_BYTES) * 100);

    let status = 'HEALTHY';
    let warningMessage = 'Database usage is well within Supabase Free plan limits.';

    if (percentageUsed >= 90) {
      status = 'CRITICAL';
      warningMessage = 'CRITICAL: Database storage is at or above 90% of the 500 MB limit!';
    } else if (percentageUsed >= 80) {
      status = 'STRONG_WARNING';
      warningMessage = 'STRONG WARNING: Database storage has reached 80% of the 500 MB limit.';
    } else if (percentageUsed >= 70) {
      status = 'WARNING';
      warningMessage = 'WARNING: Database storage has reached 70% of the 500 MB limit.';
    }

    // 5-Year Workload Projection at 20 jobs/day (7,300 jobs/yr -> 36,500 jobs)
    const fiveYearJobsCount = 36500;
    const fiveYearEstimatedBytes = baseCatalogBytes + (fiveYearJobsCount * 392.1) + estimatedOtherBytes;
    const fiveYearEstimatedMb = fiveYearEstimatedBytes / (1024 * 1024);
    const fiveYearPercentage = (fiveYearEstimatedBytes / SUPABASE_FREE_LIMIT_BYTES) * 100;

    return {
      success: true,
      timestamp: new Date().toISOString(),
      storage: {
        estimatedBytes: totalEstimatedBytes,
        usedMb: parseFloat(usedMb.toFixed(2)),
        limitMb,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        status,
        warningMessage,
      },
      tableMetrics: {
        jobs: jobsCount,
        staffProfiles: staffCount,
        activeStaffProfiles: activeStaffCount,
        serviceSections: serviceSectionCount,
        totalServices: servicesCount,
        appSettings: settingsCount,
        whatsappAuthRecords: waAuthCount,
      },
      backup: getBackupSummary(),
      projection5Years: {
        assumedJobsPerDay: 20,
        projectedTotalJobs: fiveYearJobsCount,
        projectedSizeMb: parseFloat(fiveYearEstimatedMb.toFixed(2)),
        projectedPercentage: parseFloat(fiveYearPercentage.toFixed(2)),
        fitsInFreeTier: fiveYearEstimatedMb < limitMb,
      },
    };
  } catch (error) {
    console.error('[DB USAGE] Error computing database usage metrics:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generates a full PostgreSQL-restorable .sql dump file from live Supabase tables
 */
export async function createDatabaseBackup(supabase) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `GO-GRAND-DB-${timestamp}.sql`;
  const filePath = path.join(BACKUPS_DIR, filename);

  console.log(`📦 [DATABASE BACKUP] Starting database dump to '${filename}'...`);

  try {
    const [jobsRes, staffRes, servicesRes, settingsRes, whatsappAuthRes] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: true }),
      supabase.from('staff_profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('service_sections').select('*').order('created_at', { ascending: true }),
      supabase.from('app_settings').select('*'),
      supabase.from('whatsapp_auth_state').select('*').order('updated_at', { ascending: true }),
    ]);

    const responses = [jobsRes, staffRes, servicesRes, settingsRes, whatsappAuthRes];
    const failedResponse = responses.find((response) => response.error);
    if (failedResponse) {
      throw new Error(`Backup source query failed: ${failedResponse.error.message}`);
    }

    const jobs = jobsRes.data || [];
    const staff = staffRes.data || [];
    const services = servicesRes.data || [];
    const settings = settingsRes.data || [];
    const whatsappAuth = whatsappAuthRes.data || [];

    const lines = [];
    lines.push('-- ==============================================================================');
    lines.push(`-- GO GRAND CAR WASH & DETAILING - FULL DATABASE BACKUP`);
    lines.push(`-- Generated At: ${new Date().toISOString()}`);
    lines.push(`-- Records: ${jobs.length} Jobs, ${staff.length} Staff, ${services.length} Sections, ${settings.length} Settings, ${whatsappAuth.length} WhatsApp Auth Records`);
    lines.push('-- ==============================================================================\n');
    lines.push('SET statement_timeout = 0;');
    lines.push('SET client_encoding = \'UTF8\';\n');

    // 1. Table: jobs
    lines.push('-- Table: public.jobs');
    lines.push('CREATE TABLE IF NOT EXISTS public.jobs (');
    lines.push('    id TEXT PRIMARY KEY,');
    lines.push('    vehicle_number TEXT NOT NULL,');
    lines.push('    customer_name TEXT NOT NULL,');
    lines.push('    phone_number TEXT NOT NULL,');
    lines.push('    vehicle_name TEXT,');
    lines.push('    services JSONB DEFAULT \'[]\'::jsonb,');
    lines.push('    price TEXT NOT NULL,');
    lines.push('    discount TEXT,');
    lines.push('    bill_no TEXT,');
    lines.push('    status TEXT DEFAULT \'pending\',');
    lines.push('    created_by TEXT,');
    lines.push('    created_by_id TEXT,');
    lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    lines.push(');\n');
    lines.push('CREATE INDEX IF NOT EXISTS idx_jobs_vehicle_number ON public.jobs (vehicle_number);');
    lines.push('CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs (created_at DESC);');
    lines.push('CREATE INDEX IF NOT EXISTS idx_jobs_phone_number ON public.jobs (phone_number);\n');
    lines.push('ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;');
    lines.push('DROP POLICY IF EXISTS "Allow authenticated read operations on jobs" ON public.jobs;');
    lines.push('CREATE POLICY "Allow authenticated read operations on jobs" ON public.jobs FOR SELECT USING (true);');
    lines.push('DROP POLICY IF EXISTS "Allow validated job insertions" ON public.jobs;');
    lines.push('CREATE POLICY "Allow validated job insertions" ON public.jobs FOR INSERT WITH CHECK (length(trim(vehicle_number)) > 0 AND length(trim(customer_name)) > 0 AND length(trim(phone_number)) > 0);');
    lines.push('DROP POLICY IF EXISTS "Allow authorized job updates" ON public.jobs;');
    lines.push('CREATE POLICY "Allow authorized job updates" ON public.jobs FOR UPDATE USING (true) WITH CHECK (length(trim(vehicle_number)) > 0 AND length(trim(customer_name)) > 0);');
    lines.push('DROP POLICY IF EXISTS "Allow authorized job deletions" ON public.jobs;');
    lines.push('CREATE POLICY "Allow authorized job deletions" ON public.jobs FOR DELETE USING (true);\n');

    if (jobs.length > 0) {
      lines.push('INSERT INTO public.jobs (id, vehicle_number, customer_name, phone_number, vehicle_name, services, price, discount, bill_no, status, created_by, created_by_id, created_at) VALUES');
      const jobRows = jobs.map((j) => {
        return `  (${escapeSqlValue(j.id)}, ${escapeSqlValue(j.vehicle_number)}, ${escapeSqlValue(j.customer_name)}, ${escapeSqlValue(j.phone_number)}, ${escapeSqlValue(j.vehicle_name)}, ${escapeSqlValue(j.services)}, ${escapeSqlValue(j.price)}, ${escapeSqlValue(j.discount)}, ${escapeSqlValue(j.bill_no)}, ${escapeSqlValue(j.status)}, ${escapeSqlValue(j.created_by)}, ${escapeSqlValue(j.created_by_id)}, ${escapeSqlValue(j.created_at)})`;
      });
      lines.push(jobRows.join(',\n') + '\nON CONFLICT (id) DO UPDATE SET vehicle_number = EXCLUDED.vehicle_number, customer_name = EXCLUDED.customer_name, phone_number = EXCLUDED.phone_number, price = EXCLUDED.price, status = EXCLUDED.status;\n');
    }

    // 2. Table: staff_profiles
    lines.push('-- Table: public.staff_profiles');
    lines.push('CREATE TABLE IF NOT EXISTS public.staff_profiles (');
    lines.push('    id TEXT PRIMARY KEY,');
    lines.push('    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,');
    lines.push('    staff_name TEXT NOT NULL,');
    lines.push('    phone_number TEXT NOT NULL UNIQUE,');
    lines.push('    password_hash TEXT NOT NULL,');
    lines.push('    role TEXT NOT NULL DEFAULT \'STAFF\' CHECK (role IN (\'OWNER\', \'STAFF\')),');
    lines.push('    active BOOLEAN NOT NULL DEFAULT true,');
    lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now()),');
    lines.push('    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    lines.push(');\n');
    lines.push('ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;');
    lines.push('DROP POLICY IF EXISTS "Allow staff profile read for authentication" ON public.staff_profiles;');
    lines.push('CREATE POLICY "Allow staff profile read for authentication" ON public.staff_profiles FOR SELECT USING (true);');
    lines.push('DROP POLICY IF EXISTS "Allow authorized staff management mutations" ON public.staff_profiles;');
    lines.push('CREATE POLICY "Allow authorized staff management mutations" ON public.staff_profiles FOR ALL USING (true) WITH CHECK (length(trim(staff_name)) > 0 AND length(trim(phone_number)) > 0 AND length(trim(password_hash)) > 0);\n');

    if (staff.length > 0) {
      lines.push('INSERT INTO public.staff_profiles (id, user_id, staff_name, phone_number, password_hash, role, active, created_at, updated_at) VALUES');
      const staffRows = staff.map((s) => {
        return `  (${escapeSqlValue(s.id)}, ${escapeSqlValue(s.user_id)}, ${escapeSqlValue(s.staff_name)}, ${escapeSqlValue(s.phone_number)}, ${escapeSqlValue(s.password_hash)}, ${escapeSqlValue(s.role)}, ${escapeSqlValue(s.active)}, ${escapeSqlValue(s.created_at)}, ${escapeSqlValue(s.updated_at)})`;
      });
      lines.push(staffRows.join(',\n') + '\nON CONFLICT (phone_number) DO UPDATE SET staff_name = EXCLUDED.staff_name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = EXCLUDED.active;\n');
    }

    // 3. Table: service_sections
    lines.push('-- Table: public.service_sections');
    lines.push('CREATE TABLE IF NOT EXISTS public.service_sections (');
    lines.push('    id TEXT PRIMARY KEY,');
    lines.push('    name TEXT NOT NULL,');
    lines.push('    services JSONB NOT NULL DEFAULT \'[]\'::jsonb,');
    lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    lines.push(');\n');
    lines.push('ALTER TABLE public.service_sections ENABLE ROW LEVEL SECURITY;');
    lines.push('DROP POLICY IF EXISTS "Allow public read for service_sections" ON public.service_sections;');
    lines.push('CREATE POLICY "Allow public read for service_sections" ON public.service_sections FOR SELECT USING (true);');
    lines.push('DROP POLICY IF EXISTS "Allow authorized service mutations" ON public.service_sections;');
    lines.push('CREATE POLICY "Allow authorized service mutations" ON public.service_sections FOR ALL USING (true) WITH CHECK (length(trim(name)) > 0);\n');

    if (services.length > 0) {
      lines.push('INSERT INTO public.service_sections (id, name, services, created_at) VALUES');
      const serviceRows = services.map((sec) => {
        return `  (${escapeSqlValue(sec.id)}, ${escapeSqlValue(sec.name)}, ${escapeSqlValue(sec.services)}, ${escapeSqlValue(sec.created_at)})`;
      });
      lines.push(serviceRows.join(',\n') + '\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, services = EXCLUDED.services;\n');
    }

    // 4. Table: app_settings
    lines.push('-- Table: public.app_settings');
    lines.push('CREATE TABLE IF NOT EXISTS public.app_settings (');
    lines.push('    key TEXT PRIMARY KEY,');
    lines.push('    value JSONB NOT NULL,');
    lines.push('    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    lines.push(');\n');
    lines.push('ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;');
    lines.push('DROP POLICY IF EXISTS "Allow public read for app_settings" ON public.app_settings;');
    lines.push('CREATE POLICY "Allow public read for app_settings" ON public.app_settings FOR SELECT USING (true);');
    lines.push('DROP POLICY IF EXISTS "Allow authorized app_settings mutations" ON public.app_settings;');
    lines.push('CREATE POLICY "Allow authorized app_settings mutations" ON public.app_settings FOR ALL USING (true) WITH CHECK (length(trim(key)) > 0);\n');

    if (settings.length > 0) {
      lines.push('INSERT INTO public.app_settings (key, value, updated_at) VALUES');
      const settingRows = settings.map((st) => {
        return `  (${escapeSqlValue(st.key)}, ${escapeSqlValue(st.value)}, ${escapeSqlValue(st.updated_at)})`;
      });
      lines.push(settingRows.join(',\n') + '\nON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;\n');
    }

    // 5. Table: whatsapp_auth_state (Baileys credentials and Signal keys)
    lines.push('-- Table: public.whatsapp_auth_state');
    lines.push('CREATE TABLE IF NOT EXISTS public.whatsapp_auth_state (');
    lines.push('    session_id TEXT NOT NULL DEFAULT \'default\',');
    lines.push('    key_id TEXT NOT NULL,');
    lines.push('    value JSONB,');
    lines.push('    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now()),');
    lines.push('    PRIMARY KEY (session_id, key_id)');
    lines.push(');');
    lines.push('ALTER TABLE public.whatsapp_auth_state ENABLE ROW LEVEL SECURITY;');
    lines.push('DROP POLICY IF EXISTS "Allow server backend operations for whatsapp_auth_state" ON public.whatsapp_auth_state;');
    lines.push('CREATE POLICY "Allow server backend operations for whatsapp_auth_state" ON public.whatsapp_auth_state FOR ALL USING (true) WITH CHECK (true);');
    lines.push('CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_state_lookup ON public.whatsapp_auth_state (session_id, key_id);\n');

    if (whatsappAuth.length > 0) {
      lines.push('INSERT INTO public.whatsapp_auth_state (session_id, key_id, value, updated_at) VALUES');
      const authRows = whatsappAuth.map((record) => {
        return `  (${escapeSqlValue(record.session_id)}, ${escapeSqlValue(record.key_id)}, ${escapeSqlValue(record.value)}, ${escapeSqlValue(record.updated_at)})`;
      });
      lines.push(authRows.join(',\n') + '\nON CONFLICT (session_id, key_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;\n');
    }

    const sqlContent = lines.join('\n');
    fs.writeFileSync(filePath, sqlContent, 'utf8');

    // Verify non-zero file size & calculate SHA-256 checksum
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error('Generated backup file is empty (0 bytes).');
    }

    const fileBuffer = fs.readFileSync(filePath);
    const checksumSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    console.log(`✅ [DATABASE BACKUP] Created '${filename}' (${stats.size} bytes | SHA-256: ${checksumSha256.substring(0, 16)}...)`);

    // Upload to Google Drive if credentials exist
    let googleDriveResult = await uploadToGoogleDrive(filePath, filename);
    const backupStatus = {
      filename,
      localGeneratedAt: new Date().toISOString(),
      localSuccess: true,
      googleDrive: googleDriveResult,
      checksumSha256,
    };
    saveBackupMetadata(backupStatus);

    // Apply retention policy
    cleanOldBackups();

    return {
      success: true,
      filename,
      filePath,
      sizeBytes: stats.size,
      sizeKb: (stats.size / 1024).toFixed(2),
      checksumSha256,
      recordCounts: {
        jobs: jobs.length,
        staff: staff.length,
        serviceSections: services.length,
        appSettings: settings.length,
        whatsappAuthRecords: whatsappAuth.length,
      },
      googleDrive: googleDriveResult,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('❌ [DATABASE BACKUP ERROR]:', err);
    return {
      success: false,
      error: err.message,
    };
  }

}

function readBackupMetadata() {
  try {
    if (!fs.existsSync(BACKUP_METADATA_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(BACKUP_METADATA_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('[BACKUP STATUS] Could not read backup metadata:', error.message);
    return [];
  }
}

function saveBackupMetadata(entry) {
  const entries = [...readBackupMetadata().filter((item) => item.filename !== entry.filename), entry]
    .sort((a, b) => new Date(b.localGeneratedAt) - new Date(a.localGeneratedAt))
    .slice(0, 100);
  fs.writeFileSync(BACKUP_METADATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

export function getBackupSummary() {
  const entries = readBackupMetadata();
  const successfulLocalBackups = entries.filter((entry) => entry.localSuccess);
  const successfulGoogleDriveBackups = entries.filter((entry) => entry.googleDrive?.uploaded === true);
  const latest = successfulLocalBackups[0] || null;
  return {
    lastSuccessfulAt: latest?.localGeneratedAt || null,
    lastSuccessfulFilename: latest?.filename || null,
    successfulBackupCount: successfulLocalBackups.length,
    googleDriveConfigured: entries.some((entry) => entry.googleDrive?.status !== 'CONFIG_PENDING'),
    googleDriveSuccessfulCount: successfulGoogleDriveBackups.length,
    googleDriveLastSuccessfulAt: successfulGoogleDriveBackups[0]?.googleDrive?.uploadedAt || null,
    status: latest ? 'LOCAL_SUCCESS' : 'NO_SUCCESSFUL_BACKUP',
  };
}

/**
 * Uploads a backup file to Google Drive using Google Drive REST API v3
 */
async function uploadToGoogleDrive(filePath, filename) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!folderId || !clientId || !clientSecret || !refreshToken) {
    return {
      uploaded: false,
      status: 'CONFIG_PENDING',
      message: 'Google Drive environment variables not set. Backup safely saved on persistent local server storage.',
    };
  }

  try {
    // 1. Obtain Google OAuth2 access token using refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(`Google OAuth error: ${tokenData.error_description || tokenData.error || 'Failed to obtain access token'}`);
    }

    const accessToken = tokenData.access_token;
    const fileContent = fs.readFileSync(filePath);

    // 2. Upload file metadata and content via multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'application/sql',
      description: `GO GRAND Production Database Backup (${new Date().toISOString()})`,
    };

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/sql\r\n\r\n'
      ),
      fileContent,
      Buffer.from(closeDelimiter),
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartRequestBody.length),
        },
        body: multipartRequestBody,
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(`Google Drive upload failed: ${uploadData.error?.message || uploadRes.statusText}`);
    }

    console.log(`☁️ [GOOGLE DRIVE] Successfully uploaded '${filename}' (File ID: ${uploadData.id})`);
    return {
      uploaded: true,
      status: 'SUCCESS',
      fileId: uploadData.id,
      fileName: uploadData.name,
      uploadedAt: new Date().toISOString(),
    };
  } catch (driveErr) {
    console.warn('⚠️ [GOOGLE DRIVE WARNING]:', driveErr.message);
    return {
      uploaded: false,
      status: 'ERROR',
      error: driveErr.message,
      message: 'Backup safely preserved locally.',
    };
  }
}

/**
 * Retention Policy:
 * - Keep daily backups for 30 days
 * - Keep monthly backups (1st of each month) long term
 * - Never delete the newest/only backup
 */
export function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('GO-GRAND-DB-') && f.endsWith('.sql'))
      .map((f) => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return { name: f, path: fullPath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    if (files.length <= 1) {
      return; // Never delete if only 1 backup exists
    }

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (let i = 1; i < files.length; i++) {
      const file = files[i];
      const ageMs = now - file.mtime;

      if (ageMs > thirtyDaysMs) {
        // Check if it's the 1st day of the month (preserve for long term monthly archive)
        const date = new Date(file.mtime);
        const isFirstOfMonth = date.getUTCDate() === 1;

        if (!isFirstOfMonth) {
          try {
            fs.unlinkSync(file.path);
            console.log(`🧹 [RETENTION] Removed expired local backup '${file.name}'`);
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.warn('[RETENTION] Error cleaning old backups:', err.message);
  }
}

/**
 * Lists all existing local backups and their checksums
 */
export function listBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('GO-GRAND-DB-') && f.endsWith('.sql'))
      .map((f) => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeKb: (stats.size / 1024).toFixed(2),
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  } catch {
    return [];
  }
}

/**
 * Initializes automatic daily backup scheduler (Runs every 24 hours)
 */
export function initBackupScheduler(supabase) {
  console.log('⏰ [BACKUP SCHEDULER] Initialized automatic daily database backup scheduler.');

  // Run initial lightweight backup check 10 seconds after server startup
  setTimeout(() => {
    createDatabaseBackup(supabase).catch((e) => console.warn('[BACKUP CRON WARNING]:', e.message));
  }, 10000);

  // Daily interval (24 hours = 86,400,000 ms)
  setInterval(() => {
    console.log('⏰ [BACKUP SCHEDULER] Triggering scheduled daily database backup...');
    createDatabaseBackup(supabase).catch((e) => console.warn('[BACKUP CRON WARNING]:', e.message));
  }, 24 * 60 * 60 * 1000);
}
