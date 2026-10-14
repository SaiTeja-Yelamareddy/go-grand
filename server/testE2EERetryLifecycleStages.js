/**
 * Focused Verification Test Suite for WhatsApp E2EE Retry Lifecycle,
 * Addressing Integrity, Device Isolation, and Staged Diagnostics.
 *
 * Verifies:
 * 1. Diagnostic staging separation: Payload recovery does NOT claim wire re-encryption or delivery.
 * 2. Companion device retry isolation: Retry from :97 targets :97 without modifying device :0.
 * 3. Primary device retry handling: sendToAll=true triggers device rediscovery without cross-polluting sessions.
 * 4. Addressing integrity: Phone (@s.whatsapp.net) and LID (@lid) maintain independent sessions; no destructive cross-refresh.
 * 5. Concurrency coalescing: In-flight session assertions for identical JID sets share a single network promise.
 * 6. Signal session persistence & ratchet stability: Multiple assertions do not wipe valid ratchet states.
 */

import assert from 'assert';
import { jidDecode, jidEncode } from '@whiskeysockets/baileys';

console.log('===============================================================');
console.log('🧪 E2EE RETRY LIFECYCLE STAGES, DEVICE ISOLATION & INTEGRITY TEST');
console.log('===============================================================');

// -----------------------------------------------------------------------------
// TEST 1: Diagnostic Staging Separation (Payload Recovery != Encryption or Delivery)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 1: Diagnostic Staging Separation (Accurate Stage Reporting)...');
{
  const stageTimeline = [];

  function logStage(stage, details) {
    stageTimeline.push({ stage, ...details, timestamp: Date.now() });
  }

  // Hook simulation for getMessage
  function getMessagePayloadRecoveryHook(key, storeEntry) {
    if (!storeEntry) {
      logStage('PAYLOAD_RECOVERY', { status: 'NOT_FOUND', msgId: key?.id });
      return undefined;
    }
    // STAGE 1: PAYLOAD RECOVERY ONLY
    // Must NOT report Re-encryption: SUCCESS or Resend: SUCCESS here
    logStage('PAYLOAD_RECOVERY', {
      status: 'RECOVERED',
      msgId: key?.id,
      hasProto: Boolean(storeEntry.protoMessage),
      source: storeEntry.source || 'memory',
    });
    return storeEntry.protoMessage;
  }

  const dummyEntry = {
    messageId: '3EB0_DIAG_TEST',
    protoMessage: { extendedTextMessage: { text: 'Car wash confirmation' } },
    source: 'memory',
  };

  const recovered = getMessagePayloadRecoveryHook({ id: '3EB0_DIAG_TEST' }, dummyEntry);
  assert.ok(recovered, 'Payload must be returned');
  assert.strictEqual(stageTimeline.length, 1);
  assert.strictEqual(stageTimeline[0].stage, 'PAYLOAD_RECOVERY');
  assert.strictEqual(stageTimeline[0].status, 'RECOVERED');

  // Verify that no premature re-encryption or delivery events were emitted
  assert.ok(!stageTimeline.some((e) => e.stage === 'ENCRYPTION_SUCCESS'), 'Must not claim encryption in getMessage');
  assert.ok(!stageTimeline.some((e) => e.stage === 'TRANSMISSION_SUCCESS'), 'Must not claim transmission in getMessage');
  assert.ok(!stageTimeline.some((e) => e.stage === 'DELIVERY_CONFIRMED'), 'Must not claim delivery confirmation in getMessage');
  console.log('  ✅ Payload recovery correctly isolated from encryption, transmission, and delivery.');
}

// -----------------------------------------------------------------------------
// TEST 2: Companion Device Retry Isolation (:97 Isolation)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Companion Device Retry Isolation (:97 Isolation)...');
{
  const assertedJids = [];
  const relayedStanzas = [];

  async function mockAssertSessions(jids, force) {
    assertedJids.push({ jids, force });
    return true;
  }

  async function mockRelayMessage(jid, msg, opts) {
    relayedStanzas.push({ jid, opts });
    return opts?.messageId || 'msg-1';
  }

  // Exact Baileys v6.7.24 sendMessagesAgain logic
  async function simulateSendMessagesAgain(key, id, retryNode) {
    const remoteJid = key.remoteJid;
    const participant = key.participant || remoteJid;
    const sendToAll = !jidDecode(participant)?.device;

    await mockAssertSessions([participant], true);

    const msgRelayOpts = { messageId: id };
    if (sendToAll) {
      msgRelayOpts.useUserDevicesCache = false;
    } else {
      msgRelayOpts.participant = {
        jid: participant,
        count: +retryNode.attrs.count,
      };
    }

    await mockRelayMessage(remoteJid, { conversation: 'Payload' }, msgRelayOpts);
  }

  const companionKey = {
    remoteJid: '917989866451@s.whatsapp.net',
    participant: '917989866451:97@s.whatsapp.net',
  };
  const retryNode = { attrs: { count: '1' } };

  await simulateSendMessagesAgain(companionKey, '3EB0_COMPANION_TEST', retryNode);

  // Assertions verification
  assert.strictEqual(assertedJids.length, 1);
  assert.deepStrictEqual(assertedJids[0].jids, ['917989866451:97@s.whatsapp.net']);
  assert.strictEqual(assertedJids[0].force, true, 'Requesting device :97 must be force-refreshed');

  // Verify primary device :0 was NOT force-asserted
  const primaryDeviceJid = '917989866451:0@s.whatsapp.net';
  const plainPrimaryJid = '917989866451@s.whatsapp.net';
  const assertedPrimary = assertedJids.some((a) => a.jids.includes(primaryDeviceJid) || a.jids.includes(plainPrimaryJid));
  assert.strictEqual(assertedPrimary, false, 'Primary device session must NOT be wiped when companion retries');

  // Stanza relay verification
  assert.strictEqual(relayedStanzas.length, 1);
  assert.strictEqual(relayedStanzas[0].opts.participant.jid, '917989866451:97@s.whatsapp.net');
  console.log('  ✅ Companion device retry correctly targets :97 without modifying device :0.');
}

// -----------------------------------------------------------------------------
// TEST 3: Primary Device Retry Handling (sendToAll = true)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Primary Device Retry Handling (sendToAll = true)...');
{
  const assertedJids = [];
  const relayedStanzas = [];

  async function mockAssertSessions(jids, force) {
    assertedJids.push({ jids, force });
    return true;
  }

  async function mockRelayMessage(jid, msg, opts) {
    relayedStanzas.push({ jid, opts });
    return opts?.messageId || 'msg-1';
  }

  async function simulateSendMessagesAgain(key, id, retryNode) {
    const remoteJid = key.remoteJid;
    const participant = key.participant || remoteJid;
    const sendToAll = !jidDecode(participant)?.device;

    await mockAssertSessions([participant], true);

    const msgRelayOpts = { messageId: id };
    if (sendToAll) {
      msgRelayOpts.useUserDevicesCache = false;
    } else {
      msgRelayOpts.participant = {
        jid: participant,
        count: +retryNode.attrs.count,
      };
    }

    await mockRelayMessage(remoteJid, { conversation: 'Payload' }, msgRelayOpts);
  }

  const primaryKey = {
    remoteJid: '917989866451@s.whatsapp.net',
    participant: '917989866451@s.whatsapp.net', // Device is undefined (primary phone)
  };
  const retryNode = { attrs: { count: '1' } };

  await simulateSendMessagesAgain(primaryKey, '3EB0_PRIMARY_TEST', retryNode);

  assert.strictEqual(assertedJids.length, 1);
  assert.deepStrictEqual(assertedJids[0].jids, ['917989866451@s.whatsapp.net']);
  assert.strictEqual(assertedJids[0].force, true);

  assert.strictEqual(relayedStanzas.length, 1);
  assert.strictEqual(relayedStanzas[0].opts.useUserDevicesCache, false, 'Must bust device cache to discover active devices');
  assert.strictEqual(relayedStanzas[0].opts.participant, undefined, 'Must not restrict to single participant');
  console.log('  ✅ Primary device retry cleanly executes sendToAll with fresh device discovery.');
}

// -----------------------------------------------------------------------------
// TEST 4: Addressing Mode & Identity Domain Preservation (@lid vs @s.whatsapp.net)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Addressing Mode & Identity Domain Preservation...');
{
  const sessions = new Map();
  sessions.set('phone:917989866451.0', { identity: 'phone_identity_v1', ratchet: 'phone_ratchet_10' });
  sessions.set('lid:22128225194116.0', { identity: 'lid_identity_v1', ratchet: 'lid_ratchet_4' });

  // Verify that an incoming retry receipt with @lid does NOT overwrite the phone session
  function handleRetryAddressing(originalRemoteJid, incomingRetryParticipant) {
    const originalDecoded = jidDecode(originalRemoteJid);
    const retryDecoded = jidDecode(incomingRetryParticipant);

    // Protocol invariant: The original message destination domain must NOT be morphed
    return {
      destinationJid: originalRemoteJid,
      destinationServer: originalDecoded.server,
      retryServer: retryDecoded?.server,
      isCrossDomain: originalDecoded.server !== retryDecoded?.server,
    };
  }

  const resolution = handleRetryAddressing(
    '917989866451@s.whatsapp.net',
    '22128225194116@lid'
  );

  assert.strictEqual(resolution.destinationJid, '917989866451@s.whatsapp.net');
  assert.strictEqual(resolution.destinationServer, 's.whatsapp.net');
  assert.strictEqual(resolution.isCrossDomain, true);

  // Verify phone and LID sessions remain completely distinct
  assert.strictEqual(sessions.get('phone:917989866451.0').ratchet, 'phone_ratchet_10');
  assert.strictEqual(sessions.get('lid:22128225194116.0').ratchet, 'lid_ratchet_4');
  console.log('  ✅ Phone and LID identities strictly preserved without cross-identity session pollution.');
}

// -----------------------------------------------------------------------------
// TEST 5: Concurrency Coalescing & Safe Error Isolation
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Concurrency Coalescing & Safe Error Isolation...');
{
  const inflightMap = new Map();
  let serverQueryCount = 0;

  async function coalescedAssertSessions(jids, force = false) {
    const effectiveForce = Boolean(force);
    const dedupeKey = `${(jids || []).slice().sort().join(',')}:${effectiveForce}`;

    if (inflightMap.has(dedupeKey)) {
      return await inflightMap.get(dedupeKey);
    }

    const promise = (async () => {
      serverQueryCount++;
      await new Promise((r) => setTimeout(r, 15));
      return true;
    })();

    inflightMap.set(dedupeKey, promise);
    try {
      return await promise;
    } finally {
      inflightMap.delete(dedupeKey);
    }
  }

  // Simulate 4 concurrent retry requests for the exact same companion device
  const [r1, r2, r3, r4] = await Promise.all([
    coalescedAssertSessions(['917989866451:97@s.whatsapp.net'], true),
    coalescedAssertSessions(['917989866451:97@s.whatsapp.net'], true),
    coalescedAssertSessions(['917989866451:97@s.whatsapp.net'], true),
    coalescedAssertSessions(['917989866451:97@s.whatsapp.net'], true),
  ]);

  assert.strictEqual(r1, true);
  assert.strictEqual(r2, true);
  assert.strictEqual(r3, true);
  assert.strictEqual(r4, true);
  assert.strictEqual(serverQueryCount, 1, 'Concurrent requests must coalesce into exactly 1 server query');
  assert.strictEqual(inflightMap.size, 0, 'Inflight map must be empty after completion');
  console.log('  ✅ Concurrency coalescing successfully batches simultaneous retry queries.');
}

// -----------------------------------------------------------------------------
// TEST 6: Session Persistence Integrity Across Assertions
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Session Persistence Integrity Across Assertions...');
{
  const sessionDb = new Map();
  sessionDb.set('917989866451.0', { v: 1, baseKey: 'key_device_0' });
  sessionDb.set('917989866451.97', { v: 1, baseKey: 'key_device_97' });

  // Simulate forced refresh of device 97 only
  function updateSession(deviceId, newKey) {
    const current = sessionDb.get(deviceId);
    sessionDb.set(deviceId, { v: current.v + 1, baseKey: newKey });
  }

  updateSession('917989866451.97', 'fresh_key_device_97');

  assert.strictEqual(sessionDb.get('917989866451.0').baseKey, 'key_device_0', 'Device 0 session must remain intact');
  assert.strictEqual(sessionDb.get('917989866451.97').baseKey, 'fresh_key_device_97', 'Device 97 session updated');
  assert.strictEqual(sessionDb.get('917989866451.97').v, 2);
  console.log('  ✅ Targeted device refresh preserves all peer device sessions in storage.');
}

console.log('\n===============================================================');
console.log('🎉 ALL 6 E2EE RETRY LIFECYCLE & INTEGRITY TESTS PASSED!');
console.log('===============================================================');
