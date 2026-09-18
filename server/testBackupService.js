import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseUsageMetrics, createDatabaseBackup, listBackups } from './backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bpsnequgqdqofpsrcvne.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwc25lcXVncWRxb2Zwc3Jjdm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU3NjMsImV4cCI6MjEwMzg0MTc2M30.3blNafEzTPMNgzBtDg7k2dJLa91_gpI3h1kpbKkDCQ8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function runBackupTests() {
  console.log('===============================================================');
  console.log('🧪 DATABASE OPTIMIZATION, USAGE MONITORING & BACKUP TEST');
  console.log('===============================================================');

  // 1. Test Database Usage Calculation
  console.log('\n▶ TEST 1: Calculate Supabase Free Tier Usage Metrics...');
  const usage = await getDatabaseUsageMetrics(supabase);
  console.log('  Database Usage Result:', JSON.stringify(usage, null, 2));

  if (!usage.success) {
    throw new Error('Failed to get database usage metrics');
  }
  console.log(`  ✅ Current Estimated Size: ${usage.storage.usedMb} MB / ${usage.storage.limitMb} MB (${usage.storage.percentageUsed}%)`);
  console.log(`  ✅ Status: ${usage.storage.status} - ${usage.storage.warningMessage}`);
  console.log(`  ✅ 5-Year Projection: ${usage.projection5Years.projectedSizeMb} MB (${usage.projection5Years.projectedPercentage}%) - Fits in Free Tier: ${usage.projection5Years.fitsInFreeTier}`);

  // 2. Test PostgreSQL .sql Dump Creation
  console.log('\n▶ TEST 2: Generate Timestamped PostgreSQL Backup Dump...');
  const backup = await createDatabaseBackup(supabase);
  console.log('  Backup Creation Result:', JSON.stringify(backup, null, 2));

  if (!backup.success || backup.sizeBytes === 0) {
    throw new Error('Database backup failed or generated 0-byte file');
  }
  console.log(`  ✅ Backup file created: ${backup.filename}`);
  console.log(`  ✅ Size: ${backup.sizeBytes} bytes (${backup.sizeKb} KB)`);
  console.log(`  ✅ SHA-256 Checksum: ${backup.checksumSha256}`);
  console.log(`  ✅ Included Records: ${backup.recordCounts.jobs} Jobs, ${backup.recordCounts.staff} Staff, ${backup.recordCounts.serviceSections} Sections, ${backup.recordCounts.appSettings} Settings`);

  // 3. Test List Backups
  console.log('\n▶ TEST 3: List Local Backups...');
  const backups = listBackups();
  console.log(`  ✅ Found ${backups.length} local backups.`);
  backups.forEach((b) => console.log(`     - ${b.filename} (${b.sizeKb} KB | ${b.createdAt})`));

  console.log('\n===============================================================');
  console.log('🎉 ALL DATABASE USAGE & BACKUP ENGINE TESTS PASSED!');
  console.log('===============================================================');
}

runBackupTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
