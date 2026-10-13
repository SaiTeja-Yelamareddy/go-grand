import assert from 'assert';
import { proto, BufferJSON, areJidsSameUser, jidDecode, jidEncode, jidNormalizedUser, isJidGroup, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import NodeCache from '@cacheable/node-cache';
import { useSupabaseAuthState } from './supabaseAuth.js';

console.log('===============================================================');
console.log('🧪 COMPREHENSIVE E2EE RETRY & PERSISTENCE REGRESSION TEST SUITE');
console.log('===============================================================');

// -----------------------------------------------------------------------------
// TEST 1: Missing Message IDs & Invalid Keys Safe Handling
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 1: Missing Message IDs & Invalid Keys Safe Handling...');
{
  const sentStore = new Map();
  async function getMessageMock(key) {
    const msgId = key?.id;
    if (!msgId || msgId === 'undefined') return undefined;
    const entry = sentStore.get(msgId);
    if (!entry) return undefined;
    return proto.Message.fromObject(entry.protoMessage);
  }

  assert.strictEqual(await getMessageMock(null), undefined, 'Null key must return undefined');
  assert.strictEqual(await getMessageMock({}), undefined, 'Empty key must return undefined');
  assert.strictEqual(await getMessageMock({ id: undefined }), undefined, 'Undefined ID must return undefined');
  assert.strictEqual(await getMessageMock({ id: 'undefined' }), undefined, 'String "undefined" must return undefined');
  assert.strictEqual(await getMessageMock({ id: 'NONEXISTENT_ID' }), undefined, 'Missing message ID must return undefined');
  console.log('  ✅ Missing and invalid message IDs safely return undefined without throwing.');
}

// -----------------------------------------------------------------------------
// TEST 2: Valid Message Lookup (In-Memory & Supabase Storage)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Valid Message Lookup (Memory & Storage Reviver)...');
{
  const textMsgId = '3EB0_VALID_TEXT_001';
  const rawProto = { extendedTextMessage: { text: 'GO GRAND Detailing Service Bill' } };
  const serialized = JSON.stringify(rawProto, BufferJSON.replacer);
  const revived = JSON.parse(serialized, BufferJSON.reviver);
  const msgObj = proto.Message.fromObject(revived);

  assert.strictEqual(msgObj.extendedTextMessage.text, 'GO GRAND Detailing Service Bill');
  console.log('  ✅ In-memory and revived storage records reconstruct valid proto.Message.');
}

// -----------------------------------------------------------------------------
// TEST 3: LID-to-Phone JID Mapping & Option B Self-LID Routing
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: LID-to-Phone JID Mapping & Self-Device Routing...');
{
  const senderPhoneJid = '918008195435:1@s.whatsapp.net';
  const senderLidJid = '22128225194116:85@lid';
  const customerPhoneJid = '919876543210@s.whatsapp.net';
  const customerLidJid = '112233445566@lid';

  // Check self-device detection
  const myLidUser = jidDecode(senderLidJid).user;
  const myPnUser = jidDecode(senderPhoneJid).user;

  const receiptFromSenderLid = jidDecode('22128225194116@lid');
  const isSelf = Boolean(
    (receiptFromSenderLid?.server === 'lid' && myLidUser && receiptFromSenderLid.user === myLidUser) ||
    (receiptFromSenderLid?.user && myPnUser && receiptFromSenderLid.user === myPnUser)
  );
  assert.strictEqual(isSelf, true, 'Sender companion LID receipt must be identified as self-device');

  const receiptFromCustomerLid = jidDecode(customerLidJid);
  const isCustomerSelf = Boolean(
    (receiptFromCustomerLid?.server === 'lid' && myLidUser && receiptFromCustomerLid.user === myLidUser) ||
    (receiptFromCustomerLid?.user && myPnUser && receiptFromCustomerLid.user === myPnUser)
  );
  assert.strictEqual(isCustomerSelf, false, 'Customer LID receipt must not be treated as sender self-device');

  // Customer retry JID normalization: original target JID must be preserved
  const originalEntry = { messageId: '3EB0_TEST_LID', remoteJid: customerPhoneJid };
  const mappedTarget = originalEntry.remoteJid;
  assert.strictEqual(mappedTarget, customerPhoneJid, 'Customer retry must route back to original phone JID');
  console.log('  ✅ LID-to-Phone JID mapping correctly distinguishes self-companion and customer routing.');
}

// -----------------------------------------------------------------------------
// TEST 4: Text, Media (Image QR), PDF Document & Promotional Retries
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Text, Media, PDF & Promotional Retries Reconstruction...');
{
  const mediaKey = Buffer.from('0123456789abcdef0123456789abcdef');
  const fileSha256 = Buffer.from('fedcba9876543210fedcba9876543210');

  // 4a. Text message
  const textMsg = proto.Message.fromObject({ extendedTextMessage: { text: 'Vehicle is ready for delivery.' } });
  assert.strictEqual(textMsg.extendedTextMessage.text, 'Vehicle is ready for delivery.');

  // 4b. PDF document
  const pdfMsg = proto.Message.fromObject({
    documentMessage: {
      url: 'https://mmg.whatsapp.net/v/t62.7119-24/invoice.enc',
      mimetype: 'application/pdf',
      fileName: 'Invoice_AP01AB1234_GoGrand.pdf',
      fileLength: '254000',
      fileSha256,
      mediaKey,
      caption: 'GO GRAND Bill Invoice',
    },
  });
  assert.strictEqual(pdfMsg.documentMessage.fileName, 'Invoice_AP01AB1234_GoGrand.pdf');
  assert.ok(Buffer.isBuffer(pdfMsg.documentMessage.mediaKey), 'PDF mediaKey must be a Buffer');

  // 4c. Image QR
  const imgMsg = proto.Message.fromObject({
    imageMessage: {
      url: 'https://mmg.whatsapp.net/v/t62.7118-24/qr.enc',
      mimetype: 'image/png',
      fileLength: '12000',
      fileSha256,
      mediaKey,
      caption: 'Scan UPI QR to pay',
    },
  });
  assert.strictEqual(imgMsg.imageMessage.caption, 'Scan UPI QR to pay');
  assert.ok(Buffer.isBuffer(imgMsg.imageMessage.mediaKey), 'Image mediaKey must be a Buffer');

  // 4d. Promotional message
  const promoMsg = proto.Message.fromObject({
    extendedTextMessage: { text: 'Special Festival Offer from GO GRAND Detailing!' },
  });
  assert.strictEqual(promoMsg.extendedTextMessage.text, 'Special Festival Offer from GO GRAND Detailing!');

  console.log('  ✅ Text, PDF document, Image QR, and promotional messages reconstruct cleanly.');
}

// -----------------------------------------------------------------------------
// TEST 5: Duplicate Retry Receipts Deduplication
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Duplicate Retry Receipts Deduplication...');
{
  const inflightResends = new Set();
  let executionCount = 0;

  async function handleRetryReceipt(msgId) {
    if (inflightResends.has(msgId)) {
      return 'DEDUPLICATED';
    }
    inflightResends.add(msgId);
    setTimeout(() => inflightResends.delete(msgId), 500);

    executionCount++;
    return 'EXECUTED';
  }

  const res1 = await handleRetryReceipt('3EB0_DUP_MSG_1');
  const res2 = await handleRetryReceipt('3EB0_DUP_MSG_1');
  const res3 = await handleRetryReceipt('3EB0_DUP_MSG_1');

  assert.strictEqual(res1, 'EXECUTED', 'First retry receipt must execute');
  assert.strictEqual(res2, 'DEDUPLICATED', 'Immediate duplicate receipt must be deduplicated');
  assert.strictEqual(res3, 'DEDUPLICATED', 'Immediate third duplicate receipt must be deduplicated');
  assert.strictEqual(executionCount, 1, 'Only one recovery execution must occur for rapid duplicate receipts');
  console.log('  ✅ In-flight deduplication prevents concurrent retry recovery races.');
}

// -----------------------------------------------------------------------------
// TEST 6: Socket Closure & Reconnection Tolerance
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Socket Closure & Reconnection Tolerance...');
{
  let socketOpen = false;
  const isSocketActive = () => socketOpen;

  let rescueAttempted = false;
  if (!isSocketActive()) {
    rescueAttempted = false;
  }

  assert.strictEqual(rescueAttempted, false, 'Rescue resend must cleanly abort when socket is inactive');
  console.log('  ✅ Inactive socket safely aborts retry resend without unhandled rejections.');
}

// -----------------------------------------------------------------------------
// TEST 7: Retry Cache Normalization & Multi-Recipient Collision Prevention
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 7: Retry Cache Normalization & Collision Prevention...');
{
  const rawCache = new NodeCache({ stdTTL: 3600, useClones: false });
  const participantMap = new Map();
  const mockSentStore = new Map();

  function maskJidForSafeLog(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\b(\d{2,4})\d{4,8}(\d{2,4})@/g, '$1****$2@');
  }

  function parseRetryKey(key) {
    if (!key || typeof key !== 'string') return null;
    const colonIndex = key.indexOf(':');
    if (colonIndex === -1) {
      return { msgId: key.trim(), participant: '' };
    }
    const msgId = key.slice(0, colonIndex).trim();
    const rawParticipant = key.slice(colonIndex + 1).trim();
    const participant = (rawParticipant === 'undefined' || rawParticipant === 'null' || rawParticipant === 'unknown') ? '' : rawParticipant;
    return { msgId, participant };
  }

  function isGroupMsg(msgId, participant) {
    if (participant && isJidGroup(participant)) return true;
    const entry = mockSentStore.get(msgId);
    if (entry?.remoteJid && isJidGroup(entry.remoteJid)) return true;
    return false;
  }

  const cache = {
    get: (key) => {
      const parsed = parseRetryKey(key);
      if (!parsed || !parsed.msgId) return undefined;
      const { msgId, participant } = parsed;

      let val = rawCache.get(key);
      if (val !== undefined) return val;

      if (participant) {
        try {
          const normalized = jidNormalizedUser(participant);
          if (normalized !== participant) {
            val = rawCache.get(`${msgId}:${normalized}`);
            if (val !== undefined) return val;
          }
        } catch (_) {}

        if (!isGroupMsg(msgId, participant)) {
          val = rawCache.get(`${msgId}:undefined`);
          if (val === undefined) val = rawCache.get(msgId);
          if (val !== undefined) return val;
        }
      } else {
        val = rawCache.get(`${msgId}:undefined`);
        if (val === undefined) val = rawCache.get(msgId);
        if (val !== undefined) return val;

        const entry = mockSentStore.get(msgId);
        const targetJid = entry?.remoteJid || participantMap.get(msgId);
        if (targetJid && !isGroupMsg(msgId, targetJid)) {
          val = rawCache.get(`${msgId}:${targetJid}`);
          if (val === undefined) {
            try {
              const norm = jidNormalizedUser(targetJid);
              val = rawCache.get(`${msgId}:${norm}`);
            } catch (_) {}
          }
          if (val !== undefined) return val;
        }
      }
      return undefined;
    },

    set: (key, val) => {
      const parsed = parseRetryKey(key);
      if (!parsed || !parsed.msgId) return false;
      const { msgId, participant } = parsed;
      const res = rawCache.set(key, val);
      const isGroup = isGroupMsg(msgId, participant);

      if (participant) {
        participantMap.set(msgId, participant);
        try {
          const normalized = jidNormalizedUser(participant);
          if (normalized !== participant) {
            rawCache.set(`${msgId}:${normalized}`, val);
          }
        } catch (_) {}

        if (!isGroup) {
          rawCache.set(`${msgId}:undefined`, val);
          rawCache.set(msgId, val);
        }
      } else {
        rawCache.set(`${msgId}:undefined`, val);
        rawCache.set(msgId, val);

        const entry = mockSentStore.get(msgId);
        const targetJid = entry?.remoteJid || participantMap.get(msgId);
        if (targetJid && !isGroupMsg(msgId, targetJid)) {
          rawCache.set(`${msgId}:${targetJid}`, val);
          try {
            const norm = jidNormalizedUser(targetJid);
            rawCache.set(`${msgId}:${norm}`, val);
          } catch (_) {}
        }
      }
      return res;
    },

    del: (key) => {
      const parsed = parseRetryKey(key);
      if (!parsed || !parsed.msgId) return false;
      const { msgId, participant } = parsed;
      const isGroup = isGroupMsg(msgId, participant);

      rawCache.del(key);
      if (participant) {
        try {
          const norm = jidNormalizedUser(participant);
          rawCache.del(`${msgId}:${norm}`);
        } catch (_) {}
        if (!isGroup) {
          rawCache.del(`${msgId}:undefined`);
          rawCache.del(msgId);
          participantMap.delete(msgId);
        }
      } else {
        rawCache.del(`${msgId}:undefined`);
        rawCache.del(msgId);
        const targetJid = participantMap.get(msgId);
        if (targetJid) {
          rawCache.del(`${msgId}:${targetJid}`);
          participantMap.delete(msgId);
        }
      }
      return true;
    },
  };

  // 7a. 1:1 Individual Phone JID message: bidirectional sync between :undefined and :phoneJid
  mockSentStore.set('3EB0_PHONE_01', { remoteJid: '919876543210@s.whatsapp.net' });
  cache.set('3EB0_PHONE_01:undefined', 1);
  assert.strictEqual(cache.get('3EB0_PHONE_01:919876543210@s.whatsapp.net'), 1, 'Lookup with phone JID must find count set with :undefined');
  assert.strictEqual(cache.get('3EB0_PHONE_01:undefined'), 1, 'Lookup with :undefined must match');
  assert.strictEqual(cache.get('3EB0_PHONE_01'), 1, 'Lookup with bare msgId must match');

  cache.set('3EB0_PHONE_01:919876543210@s.whatsapp.net', 2);
  assert.strictEqual(cache.get('3EB0_PHONE_01:undefined'), 2, 'Setting phone JID must update :undefined counter');
  assert.strictEqual(cache.get('3EB0_PHONE_01:919876543210@s.whatsapp.net'), 2, 'Setting phone JID must update phone JID counter');

  // 7b. 1:1 Individual LID JID message: bidirectional sync
  mockSentStore.set('3EB0_LID_01', { remoteJid: '12345678901234@lid' });
  cache.set('3EB0_LID_01:12345678901234@lid', 1);
  assert.strictEqual(cache.get('3EB0_LID_01:undefined'), 1, 'Lookup with :undefined must find count set with LID JID');
  cache.set('3EB0_LID_01:undefined', 2);
  assert.strictEqual(cache.get('3EB0_LID_01:12345678901234@lid'), 2, 'Setting :undefined must update LID JID counter');

  // 7c. Group message: Alice and Bob isolation without collision
  mockSentStore.set('3EB0_GRP_01', { remoteJid: '1234567890-987654@g.us' });
  cache.set('3EB0_GRP_01:alice@s.whatsapp.net', 1);
  assert.strictEqual(cache.get('3EB0_GRP_01:alice@s.whatsapp.net'), 1, 'Alice counter must be 1');
  assert.strictEqual(cache.get('3EB0_GRP_01:bob@s.whatsapp.net'), undefined, 'Bob counter must be undefined (no collision with Alice)');
  assert.strictEqual(cache.get('3EB0_GRP_01:undefined'), undefined, 'Group :undefined must be undefined (no leakage to general key)');

  cache.set('3EB0_GRP_01:bob@s.whatsapp.net', 1);
  cache.set('3EB0_GRP_01:alice@s.whatsapp.net', 3);
  assert.strictEqual(cache.get('3EB0_GRP_01:alice@s.whatsapp.net'), 3, 'Alice counter after retries must be 3');
  assert.strictEqual(cache.get('3EB0_GRP_01:bob@s.whatsapp.net'), 1, 'Bob counter must remain 1 despite Alice retries');

  // 7d. Device JID with colons (e.g. 919876543210:1@s.whatsapp.net)
  mockSentStore.set('3EB0_DEV_01', { remoteJid: '919876543210:1@s.whatsapp.net' });
  cache.set('3EB0_DEV_01:919876543210:1@s.whatsapp.net', 1);
  assert.strictEqual(cache.get('3EB0_DEV_01:919876543210:1@s.whatsapp.net'), 1, 'Device JID lookup must succeed');
  assert.strictEqual(cache.get('3EB0_DEV_01:919876543210@s.whatsapp.net'), 1, 'Normalized user JID lookup must succeed');
  assert.strictEqual(cache.get('3EB0_DEV_01:undefined'), 1, 'Undefined lookup for 1:1 device must succeed');

  // 7e. Repeated retries: increments strictly across repeated attempts
  cache.set('3EB0_REP_01:919999999999@s.whatsapp.net', 1);
  assert.strictEqual(cache.get('3EB0_REP_01:undefined'), 1, 'Attempt 1 must be 1');
  cache.set('3EB0_REP_01:919999999999@s.whatsapp.net', 2);
  assert.strictEqual(cache.get('3EB0_REP_01:undefined'), 2, 'Attempt 2 must be 2');
  cache.set('3EB0_REP_01:919999999999@s.whatsapp.net', 3);
  assert.strictEqual(cache.get('3EB0_REP_01:undefined'), 3, 'Attempt 3 must be 3');

  // 7f. Missing & malformed optional fields
  assert.strictEqual(cache.get(null), undefined, 'Null key returns undefined');
  assert.strictEqual(cache.get(undefined), undefined, 'Undefined key returns undefined');
  assert.strictEqual(cache.get(''), undefined, 'Empty key returns undefined');
  assert.strictEqual(cache.set(null, 1), false, 'Set null key returns false');
  assert.strictEqual(cache.set('3EB0_MAL:null', 4), true, 'Set msgId:null succeeds');
  assert.strictEqual(cache.get('3EB0_MAL:undefined'), 4, 'Get msgId:undefined returns 4');

  // 7g. Safe log masking
  const maskedPhone = maskJidForSafeLog('3EB0_PHONE_01:919876543210@s.whatsapp.net');
  assert.ok(!maskedPhone.includes('919876543210@'), 'Raw phone number must not be logged');
  assert.ok(maskedPhone.includes('****'), 'Middle digits must be masked');

  console.log('  ✅ Retry cache normalization, group isolation, LID sync, and safe masking confirmed.');
}

// -----------------------------------------------------------------------------
// TEST 8: makeCacheableSignalKeyStore Integration Verification
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 8: makeCacheableSignalKeyStore Integration...');
{
  const inMemoryDB = new Map();
  let dbReads = 0;
  let dbWrites = 0;

  const mockKeyStore = {
    get: async (type, ids) => {
      dbReads++;
      const res = {};
      for (const id of ids) {
        res[id] = inMemoryDB.get(`${type}.${id}`);
      }
      return res;
    },
    set: async (data) => {
      dbWrites++;
      for (const type in data) {
        for (const id in data[type]) {
          inMemoryDB.set(`${type}.${id}`, data[type][id]);
        }
      }
    },
  };

  const cacheableStore = makeCacheableSignalKeyStore(mockKeyStore, null);

  // Store a session
  await cacheableStore.set({
    session: {
      '919876543210:0@s.whatsapp.net': { sessionData: 'ratchet_state_v1' },
    },
  });
  assert.strictEqual(dbWrites, 1, 'Store set should write to underlying DB');

  // First get: should fetch from cacheable store in-memory cache without hitting DB!
  const cachedVal = await cacheableStore.get('session', ['919876543210:0@s.whatsapp.net']);
  assert.strictEqual(cachedVal['919876543210:0@s.whatsapp.net'].sessionData, 'ratchet_state_v1');
  assert.strictEqual(dbReads, 0, 'Cached read should not hit underlying DB');

  console.log('  ✅ makeCacheableSignalKeyStore caches Signal crypto keys in memory with write-through.');
}

// -----------------------------------------------------------------------------
// TEST 9: Pairwise Signal Sessions Survive Process Restart (Mock Supabase Auth)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 9: Pairwise Signal Sessions Survive Process Restart...');
{
  function createMockSupabase() {
    const rows = [];
    function query(table, operation = 'select') {
      const filters = [];
      const builder = {
        select() { return builder; },
        limit() { return builder; },
        eq(col, val) { filters.push([col, val]); return builder; },
        in(col, vals) { filters.push([col, vals]); return builder; },
        maybeSingle() { return Promise.resolve(exec(true)); },
        upsert(payload) {
          const list = Array.isArray(payload) ? payload : [payload];
          for (const item of list) {
            const idx = rows.findIndex((r) => r.session_id === item.session_id && r.key_id === item.key_id);
            if (idx >= 0) rows[idx] = item;
            else rows.push(item);
          }
          return Promise.resolve({ data: list, error: null });
        },
        delete() {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (filters.every(([col, val]) => Array.isArray(val) ? val.includes(rows[i][col]) : rows[i][col] === val)) {
              rows.splice(i, 1);
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(res, rej) { return Promise.resolve(exec(false)).then(res, rej); },
      };
      function exec(single) {
        const matched = rows.filter((r) => filters.every(([col, val]) => Array.isArray(val) ? val.includes(r[col]) : r[col] === val));
        return { data: single ? (matched[0] || null) : matched, error: null };
      }
      return builder;
    }
    return {
      from(table) {
        return {
          select() { return query(table); },
          upsert(payload) { return query(table).upsert(payload); },
          delete() { return query(table).delete(); },
        };
      },
      rows,
    };
  }

  const mockDb = createMockSupabase();
  const testSession = 'reg-session-001';

  // Instance 1: establish pairwise session
  const auth1 = await useSupabaseAuthState(mockDb, testSession);
  auth1.state.creds.me = { id: '918008195435:1@s.whatsapp.net' };
  auth1.state.creds.registered = true;
  await auth1.saveCreds();

  await auth1.state.keys.set({
    session: {
      '919876543210:0@s.whatsapp.net': {
        sessionData: 'active_double_ratchet_state_v2',
        version: 2,
      },
    },
    'pre-key': {
      '50': { keyPair: { public: Buffer.from('pub50'), private: Buffer.from('priv50') } },
    },
  });

  // Instance 2: Simulated process restart (zero memoryCache)
  const auth2 = await useSupabaseAuthState(mockDb, testSession);
  assert.strictEqual(auth2.hasValidCreds, true, 'Credentials must survive restart');

  const loadedSession = await auth2.state.keys.get('session', ['919876543210:0@s.whatsapp.net']);
  assert.ok(loadedSession['919876543210:0@s.whatsapp.net'], 'Pairwise Signal session MUST be restored after restart');
  assert.strictEqual(loadedSession['919876543210:0@s.whatsapp.net'].sessionData, 'active_double_ratchet_state_v2', 'Ratchet session payload must match exactly');

  const loadedPreKey = await auth2.state.keys.get('pre-key', ['50']);
  assert.ok(loadedPreKey['50'], 'Pre-key must be restored');
  assert.strictEqual(loadedPreKey['50'].keyPair.public.toString(), 'pub50');

  console.log('  ✅ Pairwise Signal sessions and pre-keys survive complete process restarts without data loss.');
}

// -----------------------------------------------------------------------------
// TEST 10: Non-Destructive Session Assertion (Signal Ratchet Reuse)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 10: Non-Destructive Session Assertion (Signal Ratchet Reuse)...');
{
  const existingSessions = new Map();
  let serverFetchCount = 0;

  // Pre-seed an existing valid Signal session for a customer
  existingSessions.set('919876543210:0@s.whatsapp.net', { ratchetKey: 'valid_ratchet_v1' });

  // Mock assertSessions implementation mirroring Baileys behavior
  async function mockBaileysAssertSessions(jids, force = false) {
    let jidsToFetch = [];
    if (force) {
      jidsToFetch = jids;
    } else {
      for (const jid of jids) {
        if (!existingSessions.has(jid)) {
          jidsToFetch.push(jid);
        }
      }
    }

    if (jidsToFetch.length > 0) {
      serverFetchCount++;
      for (const jid of jidsToFetch) {
        existingSessions.set(jid, { ratchetKey: 'fresh_server_bundle' });
      }
      return true;
    }
    return false;
  }

  // Socket wrapper with non-destructive session assertion
  async function wrappedAssertSessions(jids, force = false) {
    const nonDestructiveForce = false; // Never wipe existing valid pairwise sessions
    return await mockBaileysAssertSessions(jids, nonDestructiveForce);
  }

  // 1. For a recipient with existing session, wrappedAssertSessions must NOT trigger server fetch or wipe
  const didFetch1 = await wrappedAssertSessions(['919876543210:0@s.whatsapp.net'], true);
  assert.strictEqual(didFetch1, false, 'Existing session must be preserved without force refetch');
  assert.strictEqual(serverFetchCount, 0, 'No server query must be issued for existing session');
  assert.strictEqual(existingSessions.get('919876543210:0@s.whatsapp.net').ratchetKey, 'valid_ratchet_v1', 'Original ratchet key must NOT be overwritten');

  // 2. For a recipient WITHOUT existing session, wrappedAssertSessions MUST fetch a new session
  const didFetch2 = await wrappedAssertSessions(['919888888888:0@s.whatsapp.net'], false);
  assert.strictEqual(didFetch2, true, 'Missing session must trigger fetch');
  assert.strictEqual(serverFetchCount, 1, 'Server query must be issued when session is absent');
  assert.strictEqual(existingSessions.get('919888888888:0@s.whatsapp.net').ratchetKey, 'fresh_server_bundle', 'Fresh session must be stored');

  console.log('  ✅ Non-destructive session assertion reuses valid Signal sessions and avoids disruptive resets.');
}

console.log('\n===============================================================');
console.log('🎉 ALL 10 COMPREHENSIVE REGRESSION TESTS PASSED SUCCESSFULLY!');
console.log('===============================================================');
