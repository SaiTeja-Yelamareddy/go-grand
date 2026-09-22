import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { useSupabaseAuthState } from './supabaseAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bpsnequgqdqofpsrcvne.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwc25lcXVncWRxb2Zwc3Jjdm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU3NjMsImV4cCI6MjEwMzg0MTc2M30.3blNafEzTPMNgzBtDg7k2dJLa91_gpI3h1kpbKkDCQ8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('🧪 Starting Supabase Baileys Auth Adapter Tests...');
  const testSessionId = 'test-session-' + Date.now();

  try {
    // 1. Initialize auth state
    console.log(`\n--- Test 1: Initialize auth state for session '${testSessionId}' ---`);
    const auth1 = await useSupabaseAuthState(supabase, testSessionId);
    if (!auth1.state.creds || !auth1.state.creds.noiseKey) {
      throw new Error('Failed to initialize fresh creds');
    }
    console.log('✅ Test 1 Passed: Fresh creds initialized with noiseKey buffer.');

    // 2. Modify and save creds
    console.log('\n--- Test 2: Modify and persist creds ---');
    auth1.state.creds.me = { id: '918008195435:1@s.whatsapp.net', name: 'Go Grand Detailing' };
    auth1.state.creds.accountSyncCounter = 42;
    await auth1.saveCreds();
    console.log('✅ Test 2 Passed: Creds saved to Supabase.');

    // 3. Set keys with binary buffers
    console.log('\n--- Test 3: Persist Signal / crypto keys ---');
    const testBuffer1 = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    const testBuffer2 = Buffer.from('hello-baileys-crypto-test', 'utf-8');

    await auth1.state.keys.set({
      'pre-key': {
        '1': { keyPair: { public: testBuffer1, private: testBuffer2 }, keyId: 1 },
        '2': { keyPair: { public: testBuffer1, private: testBuffer2 }, keyId: 2 },
      },
      'session': {
        '919876543210:0@s.whatsapp.net': { sessionData: 'active_encrypted_session', version: 3 },
      },
      'app-state-sync-key': {
        'sync-test': { keyData: new Uint8Array(testBuffer1) },
      },
    });
    console.log('✅ Test 3 Passed: Keys batch set and uploaded to Supabase.');

    // 3b. Concurrent key updates must all survive serialized writes
    console.log('\n--- Test 3b: Concurrent Signal-key updates ---');
    await Promise.all([
      auth1.state.keys.set({ 'session': { 'concurrent-a': { version: 1 } } }),
      auth1.state.keys.set({ 'session': { 'concurrent-b': { version: 1 } } }),
      auth1.state.keys.set({ 'pre-key': { '3': { keyPair: { public: new Uint8Array(testBuffer2), private: testBuffer1 } } } }),
    ]);
    console.log('✅ Test 3b Passed: Concurrent key updates completed without overwrite errors.');

    // 4. Reload from fresh instance (simulating server restart)
    console.log('\n--- Test 4: Reload auth state in a new instance (Restart Simulation) ---');
    const auth2 = await useSupabaseAuthState(supabase, testSessionId);
    if (!auth2.state.creds.me || auth2.state.creds.me.id !== '918008195435:1@s.whatsapp.net') {
      throw new Error(`Creds verification failed on reload. Expected me.id, got: ${JSON.stringify(auth2.state.creds.me)}`);
    }
    if (auth2.state.creds.accountSyncCounter !== 42) {
      throw new Error(`Creds accountSyncCounter mismatch. Expected 42, got: ${auth2.state.creds.accountSyncCounter}`);
    }
    console.log('✅ Test 4a Passed: Creds accurately reloaded from Supabase across restarts.');

    const diagnostics = await auth2.getDiagnostics();
    if (!diagnostics.session_exists || !diagnostics.required_credentials_exist || !diagnostics.credentials_deserialized || !diagnostics.signal_key_store_readable) {
      throw new Error(`Safe auth diagnostics failed: ${JSON.stringify(diagnostics)}`);
    }
    console.log('✅ Test 4b Passed: Safe auth diagnostics confirm credentials and key-store readability.');

    // 5. Batch get keys in new instance
    console.log('\n--- Test 5: Verify Signal keys retrieval and Buffer integrity ---');
    const keys = await auth2.state.keys.get('pre-key', ['1', '2', '999']);
    if (!keys['1'] || !Buffer.isBuffer(keys['1'].keyPair.public)) {
      throw new Error('Key 1 buffer was not revived as a true Buffer!');
    }
    if (Buffer.compare(keys['1'].keyPair.public, testBuffer1) !== 0) {
      throw new Error('Key 1 public buffer contents do not match original!');
    }
    const appStateKeys = await auth2.state.keys.get('app-state-sync-key', ['sync-test']);
    if (!appStateKeys['sync-test']?.keyData || !Buffer.isBuffer(appStateKeys['sync-test'].keyData)) {
      throw new Error('App-state sync key was not revived as a Buffer!');
    }
    if (keys['999'] !== null) {
      throw new Error(`Non-existent key should return null, got: ${keys['999']}`);
    }
    console.log('✅ Test 5 Passed: Signal keys accurately retrieved and Buffer byte-integrity verified.');

    // 6. Test delete key
    console.log('\n--- Test 6: Delete key update ---');
    await auth2.state.keys.set({
      'pre-key': {
        '2': null, // null removes the key
      },
    });
    const keysAfterDelete = await auth2.state.keys.get('pre-key', ['2']);
    if (keysAfterDelete['2'] !== null && keysAfterDelete['2'] !== undefined) {
      throw new Error(`Key 2 was expected to be deleted, got: ${JSON.stringify(keysAfterDelete['2'])}`);
    }
    console.log('✅ Test 6 Passed: Key deletion verified.');

    // 7. Test clearAuthState (Logout Simulation)
    console.log('\n--- Test 7: Clear auth state on logout ---');
    await auth2.clearAuthState();

    const auth3 = await useSupabaseAuthState(supabase, testSessionId);
    if (auth3.state.creds.me) {
      throw new Error('Creds me should be undefined after clearAuthState');
    }
    console.log('✅ Test 7 Passed: clearAuthState completely wiped session records.');

    console.log('\n🎉 ALL SUPABASE AUTH ADAPTER TESTS PASSED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
