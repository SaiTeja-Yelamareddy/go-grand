import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { useSupabaseAuthState } from './supabaseAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bpsnequgqdqofpsrcvne.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSessionPersistenceTest() {
  console.log('===============================================================');
  console.log('🧪 WHATSAPP SESSION PERSISTENCE & RESTART RESILIENCE TEST');
  console.log('===============================================================');

  const testSessionId = `test_persist_${Date.now()}`;
  console.log(`Session ID: ${testSessionId}\n`);

  // STEP 1: Initialize fresh credentials
  console.log('▶ STEP 1: Initialize session and generate credentials...');
  const auth1 = await useSupabaseAuthState(supabase, testSessionId);
  auth1.state.creds.me = { id: '918008195435:1@s.whatsapp.net', name: 'Go Grand Detailing' };
  auth1.state.creds.registered = true;
  auth1.state.creds.accountSyncCounter = 1;
  await auth1.saveCreds();
  console.log('  ✅ Credentials created and saved with Me ID: 918008195435:1@s.whatsapp.net');

  // STEP 2: Verify auth state exists in Supabase
  console.log('\n▶ STEP 2: Verify auth state exists in Supabase database...');
  const { data: credsRow, error: credsErr } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', `wa_auth:${testSessionId}:creds`)
    .maybeSingle();

  if (credsErr || !credsRow || !credsRow.value) {
    throw new Error(`Step 2 Failed: Could not query creds from Supabase: ${credsErr?.message}`);
  }
  console.log('  ✅ Stored database row confirmed! Key:', credsRow.key);

  // STEP 3: Record checksum and timestamp
  console.log('\n▶ STEP 3: Record checksum/version of stored auth state...');
  const checksum1 = crypto.createHash('sha256').update(JSON.stringify(credsRow.value)).digest('hex');
  console.log(`  ✅ Stored creds SHA256 checksum: ${checksum1}`);
  console.log(`  ✅ Updated at: ${credsRow.updated_at}`);

  // STEP 4: Simulate Node.js Process Restart (new instance, zero in-memory cache)
  console.log('\n▶ STEP 4 & 5: Simulate Node.js Process Restart (reload from clean Supabase state)...');
  const auth2 = await useSupabaseAuthState(supabase, testSessionId);
  
  // STEP 6: Verify restored state
  console.log('\n▶ STEP 6: Verify restored credentials integrity across restart...');
  if (!auth2.state.creds.me || auth2.state.creds.me.id !== '918008195435:1@s.whatsapp.net') {
    throw new Error('Step 6 Failed: Restored creds Me ID mismatch!');
  }
  if (!auth2.hasValidCreds) {
    throw new Error('Step 6 Failed: hasValidCreds flag was false on restored session!');
  }
  console.log('  ✅ Restored credentials verified! (No QR required, socket can connect directly)');

  // STEP 7: Simulate Signal key rotation / message encryption update
  console.log('\n▶ STEP 7 & 8: Persist Signal keys update (simulate active message encryption)...');
  const sampleKeyBuffer = Buffer.from('signal-crypto-sample-key-bytes', 'utf-8');
  await auth2.state.keys.set({
    'session': {
      '919999988888:0@s.whatsapp.net': { sessionData: 'encrypted_session_payload', version: 1 },
    },
    'pre-key': {
      '100': { keyPair: { public: sampleKeyBuffer, private: sampleKeyBuffer }, keyId: 100 },
    },
  });
  console.log('  ✅ Signal session and pre-keys persisted to Supabase.');

  // STEP 9: Restart again and verify Signal keys retrieval
  console.log('\n▶ STEP 9: Second Process Restart - Verify Signal keys restored cleanly...');
  const auth3 = await useSupabaseAuthState(supabase, testSessionId);
  const fetchedKeys = await auth3.state.keys.get('pre-key', ['100']);
  
  if (!fetchedKeys['100'] || !Buffer.isBuffer(fetchedKeys['100'].keyPair.public)) {
    throw new Error('Step 9 Failed: Signal pre-key buffer was not restored properly!');
  }
  if (Buffer.compare(fetchedKeys['100'].keyPair.public, sampleKeyBuffer) !== 0) {
    throw new Error('Step 9 Failed: Signal pre-key buffer content does not match!');
  }
  console.log('  ✅ Signal keys byte-level restoration verified after 2nd restart!');

  // Cleanup test session
  console.log('\n🧹 Cleaning up test session records...');
  await auth3.clearAuthState();
  console.log('  ✅ Cleanup complete.');

  console.log('\n===============================================================');
  console.log('🎉 ALL 9 SESSION PERSISTENCE TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runSessionPersistenceTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
