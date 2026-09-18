import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, 'backups');
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
    const [jobsRes, staffRes, servicesRes, settingsRes, waAuthRes] = await Promise.all([
      supabase.from('jobs').select('id, created_at', { count: 'exact', head: false }),
      supabase.from('staff_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('service_sections').select('id', { count: 'exact', head: true }),
      supabase.from('app_settings').select('key', { count: 'exact', head: true }),
      supabase.from('whatsapp_auth_state').select('key_id', { count: 'exact', head: true }),
    ]);

    const jobsCount = jobsRes.count || (jobsRes.data ? jobsRes.data.length : 0);
    const staffCount = staffRes.count || 0;
    const servicesCount = servicesRes.count || 0;
    const settingsCount = settingsRes.count || 0;
    const waAuthCount = waAuthRes.count || 0;

    // Approximate PostgreSQL storage per row including indexes and table page overhead:
    // jobs row: ~1.2 KB (text + JSONB services + 3 btree indexes)
    // staff_profiles: ~0.8 KB
    // service_sections: ~2.0 KB (JSONB service definitions)
    // app_settings: ~1.5 KB
    // whatsapp_auth_state / keys: ~2.5 KB
    // Base Postgres schema + system catalog overhead: ~15 MB
    const baseCatalogBytes = 15 * 1024 * 1024;
    const estimatedJobsBytes = jobsCount * 1250;
    const estimatedOtherBytes = (staffCount * 800) + (servicesCount * 2000) + (settingsCount * 1500) + (waAuthCount * 2500);
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
    const fiveYearEstimatedBytes = baseCatalogBytes + (fiveYearJobsCount * 1250) + estimatedOtherBytes;
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
        serviceSections: servicesCount,
        appSettings: settingsCount,
        whatsappAuthRecords: waAuthCount,
      },
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
    const [jobsRes, staffRes, servicesRes, settingsRes] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: true }),
      supabase.from('staff_profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('service_sections').select('*').order('created_at', { ascending: true }),
      supabase.from('app_settings').select('*'),
    ]);

    const jobs = jobsRes.data || [];
    const staff = staffRes.data || [];
    const services = servicesRes.data || [];
    const settings = settingsRes.data || [];

    const lines = [];
    lines.push('-- ==============================================================================');
    lines.push(`-- GO GRAND CAR WASH & DETAILING - FULL DATABASE BACKUP`);
    lines.push(`-- Generated At: ${new Date().toISOString()}`);
    lines.push(`-- Records: ${jobs.length} Jobs, ${staff.length} Staff, ${services.length} Sections, ${settings.length} Settings`);
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
    lines.push('    user_id UUID,');
    lines.push('    staff_name TEXT NOT NULL,');
    lines.push('    phone_number TEXT NOT NULL UNIQUE,');
    lines.push('    password_hash TEXT NOT NULL,');
    lines.push('    role TEXT NOT NULL DEFAULT \'STAFF\',');
    lines.push('    active BOOLEAN NOT NULL DEFAULT true,');
    lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now()),');
    lines.push('    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    lines.push(');\n');

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

    if (settings.length > 0) {
      lines.push('INSERT INTO public.app_settings (key, value, updated_at) VALUES');
      const settingRows = settings.map((st) => {
        return `  (${escapeSqlValue(st.key)}, ${escapeSqlValue(st.value)}, ${escapeSqlValue(st.updated_at)})`;
      });
      lines.push(settingRows.join(',\n') + '\nON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;\n');
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
