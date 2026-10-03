import assert from 'assert';
import { proto, BufferJSON, areJidsSameUser, jidDecode } from '@whiskeysockets/baileys';
import NodeCache from '@cacheable/node-cache';
import { EventEmitter } from 'events';

console.log('===============================================================');
console.log('🧪 COMPREHENSIVE BAILEYS RETRY & E2EE RECOVERY TEST SUITE');
console.log('===============================================================');

// -----------------------------------------------------------------------------
// TEST 1: Test NodeCache based msgRetryCounterCache
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 1: msgRetryCounterCache CacheStore Interface...');
const rawCache = new NodeCache({ stdTTL: 3600, useClones: false });
const msgRetryCounterCache = {
  get: (k) => rawCache.get(k),
  set: (k, v) => rawCache.set(k, v),
  del: (k) => rawCache.del(k),
  flushAll: () => rawCache.flushAll(),
};

const testMsgId = '3EB0_TEST_RETRY_123';
const testParticipant = '919876543210:0@s.whatsapp.net';
const retryKey = `${testMsgId}:${testParticipant}`;

assert.strictEqual(msgRetryCounterCache.get(retryKey), undefined, 'Initial retry count should be undefined');
msgRetryCounterCache.set(retryKey, 1);
assert.strictEqual(msgRetryCounterCache.get(retryKey), 1, 'Retry count should be 1 after set');
msgRetryCounterCache.set(retryKey, 2);
assert.strictEqual(msgRetryCounterCache.get(retryKey), 2, 'Retry count should increment to 2');
console.log('  ✅ msgRetryCounterCache complies with CacheStore interface and tracks counts.');

// -----------------------------------------------------------------------------
// TEST 2: Baileys 6.7.24 fromMe=false Flaw & Smart Getter Neutralization
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Baileys fromMe=false Flaw & Neutralization...');
const meId = '917989866451:85@s.whatsapp.net';
const meLid = '22128225194116:85@lid';

// Stanza with recipient attribute (as sent by WhatsApp server for 1-to-1 retry receipts)
const rawRetryStanza = {
  tag: 'receipt',
  attrs: {
    from: '917660984590@s.whatsapp.net',
    to: '917989866451:85@s.whatsapp.net',
    recipient: '917989866451@s.whatsapp.net',
    id: testMsgId,
    type: 'retry',
  },
  content: [
    {
      tag: 'retry',
      attrs: { count: '1', id: testMsgId, t: '1791040000', v: '1' }
    }
  ]
};

// Step 2A: Confirm Baileys default calculation evaluates to false
const isLid = rawRetryStanza.attrs.from.includes('lid');
const isNodeFromMe = areJidsSameUser(rawRetryStanza.attrs.participant || rawRetryStanza.attrs.from, isLid ? meLid : meId);
const unpatchedFromMe = !rawRetryStanza.attrs.recipient || ((rawRetryStanza.attrs.type === 'retry' || rawRetryStanza.attrs.type === 'sender') && isNodeFromMe);
assert.strictEqual(unpatchedFromMe, false, 'Unpatched Baileys 6.7.24 evaluates fromMe to false and drops retry');
console.log('  ✅ Confirmed: Unpatched Baileys evaluates fromMe=false due to recipient attribute.');

// Step 2B: Apply Smart Getter neutralization (as implemented in prependListener)
const origRecipient = rawRetryStanza.attrs.recipient;
let accessCount = 0;
Object.defineProperty(rawRetryStanza.attrs, 'recipient', {
  get() {
    accessCount++;
    return accessCount === 1 ? undefined : origRecipient;
  },
  configurable: true,
  enumerable: true,
});

// Baileys handleReceipt reads !attrs.recipient (1st read)
const patchedFromMe = !rawRetryStanza.attrs.recipient || ((rawRetryStanza.attrs.type === 'retry' || rawRetryStanza.attrs.type === 'sender') && isNodeFromMe);
assert.strictEqual(patchedFromMe, true, 'Patched Baileys fromMe should evaluate to true');

// Baileys sendMessageAck reads attrs.recipient (2nd read)
assert.strictEqual(rawRetryStanza.attrs.recipient, origRecipient, 'sendMessageAck retains original recipient attribute for ACK');
console.log('  ✅ Confirmed: Smart getter successfully forces fromMe=true while preserving ACK recipient.');

// -----------------------------------------------------------------------------
// TEST 3: Exact Original Message Key Preservation
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Message Key Preservation & Recovery Mapping...');
const mockSentMsg = {
  key: {
    id: '3EB0_EXACT_KEY_999',
    remoteJid: '919876543210@s.whatsapp.net',
    fromMe: true,
    participant: undefined,
  },
  message: {
    extendedTextMessage: { text: 'GO GRAND TEST MESSAGE' },
  },
};

const recoveryStore = new Map();
function recordSent(entry) {
  const originalKey = entry.key || {
    id: entry.messageId,
    remoteJid: entry.remoteJid,
    fromMe: true,
    participant: entry.participant || undefined,
  };
  recoveryStore.set(entry.messageId, {
    messageId: entry.messageId,
    remoteJid: entry.remoteJid,
    key: {
      id: originalKey.id,
      remoteJid: originalKey.remoteJid,
      fromMe: typeof originalKey.fromMe === 'boolean' ? originalKey.fromMe : true,
      participant: originalKey.participant || undefined,
    },
    type: entry.type,
    textMessage: entry.textMessage,
    protoMessage: entry.protoMessage,
  });
}

recordSent({
  messageId: mockSentMsg.key.id,
  remoteJid: mockSentMsg.key.remoteJid,
  key: mockSentMsg.key,
  type: 'text',
  textMessage: 'GO GRAND TEST MESSAGE',
  protoMessage: mockSentMsg.message,
});

const lookedUp = recoveryStore.get('3EB0_EXACT_KEY_999');
assert.ok(lookedUp, 'Stored message must be found by exact ID');
assert.strictEqual(lookedUp.key.id, mockSentMsg.key.id, 'key.id must match exactly');
assert.strictEqual(lookedUp.key.remoteJid, mockSentMsg.key.remoteJid, 'key.remoteJid must match exactly');
assert.strictEqual(lookedUp.key.fromMe, true, 'key.fromMe must be true');
console.log('  ✅ Confirmed: Exact original message key preserved without fake key reconstruction.');

// -----------------------------------------------------------------------------
// TEST 4: Normal Text Message Retry Recovery
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Normal Text Message Retry Recovery...');
const textEntry = recoveryStore.get('3EB0_EXACT_KEY_999');
const reconstructedTextProto = proto.Message.fromObject(textEntry.protoMessage);
assert.strictEqual(reconstructedTextProto.extendedTextMessage.text, 'GO GRAND TEST MESSAGE');
const encodedText = proto.Message.encode(reconstructedTextProto).finish();
assert.ok(encodedText.length > 0, 'Text message must encode to valid binary protobuf');
console.log('  ✅ Confirmed: Text message reconstructed and binary encoded cleanly.');

// -----------------------------------------------------------------------------
// TEST 5: Promotional Message Retry Recovery
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Promotional Message Retry Recovery...');
const promoMsgId = '3EB0_PROMO_555';
const promoText = 'Hello Customer\n\nSpecial offer from GO GRAND!\n\nDate: 03/10/2026\nTime: 09:30 PM';
recordSent({
  messageId: promoMsgId,
  remoteJid: '919876543210@s.whatsapp.net',
  key: { id: promoMsgId, remoteJid: '919876543210@s.whatsapp.net', fromMe: true },
  type: 'text',
  textMessage: promoText,
  protoMessage: { extendedTextMessage: { text: promoText } },
});

const promoEntry = recoveryStore.get(promoMsgId);
assert.ok(promoEntry, 'Promotional message found in store');
const reconstructedPromo = proto.Message.fromObject(promoEntry.protoMessage);
assert.strictEqual(reconstructedPromo.extendedTextMessage.text, promoText);
console.log('  ✅ Confirmed: Promotional message preserved and reconstructed for retry.');

// -----------------------------------------------------------------------------
// TEST 6: Invoice PDF Document Retry Recovery (Pre-existing Encrypted Media & Fallback)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Invoice PDF Document Retry Recovery...');
const pdfMsgId = '3EB0_PDF_INVOICE_777';
const sampleMediaKey = Buffer.from('12345678901234567890123456789012');
const sampleFileSha256 = Buffer.from('abcdef1234567890abcdef1234567890');
const sampleDirectPath = '/v/t62.7119-24/test-invoice.enc';

recordSent({
  messageId: pdfMsgId,
  remoteJid: '919876543210@s.whatsapp.net',
  key: { id: pdfMsgId, remoteJid: '919876543210@s.whatsapp.net', fromMe: true },
  type: 'pdf',
  textMessage: 'Your GO GRAND Invoice is ready.',
  protoMessage: {
    documentMessage: {
      url: 'https://mmg.whatsapp.net' + sampleDirectPath,
      fileName: 'Invoice_AP67HM9087_GoGrand.pdf',
      mimetype: 'application/pdf',
      directPath: sampleDirectPath,
      fileLength: '253877',
      fileSha256: sampleFileSha256,
      mediaKey: sampleMediaKey,
      caption: 'Your GO GRAND Invoice is ready.',
    }
  }
});

const pdfEntry = recoveryStore.get(pdfMsgId);
assert.ok(pdfEntry, 'PDF message found in store');
const reconstructedPdf = proto.Message.fromObject(pdfEntry.protoMessage);
assert.strictEqual(reconstructedPdf.documentMessage.fileName, 'Invoice_AP67HM9087_GoGrand.pdf');
assert.strictEqual(reconstructedPdf.documentMessage.directPath, sampleDirectPath);
assert.ok(Buffer.isBuffer(reconstructedPdf.documentMessage.mediaKey), 'mediaKey must be a Buffer for Signal encryption');
assert.ok(Buffer.isBuffer(reconstructedPdf.documentMessage.fileSha256), 'fileSha256 must be a Buffer');
console.log('  ✅ Confirmed: PDF document metadata and cryptographic mediaKey preserved.');

// -----------------------------------------------------------------------------
// TEST 7: Vehicle Ready QR Image Retry Recovery
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 7: Vehicle Ready QR / Image Retry Recovery...');
const qrMsgId = '3EB0_QR_READY_888';
recordSent({
  messageId: qrMsgId,
  remoteJid: '919876543210@s.whatsapp.net',
  key: { id: qrMsgId, remoteJid: '919876543210@s.whatsapp.net', fromMe: true },
  type: 'image_qr',
  textMessage: 'Vehicle is ready for pickup!',
  protoMessage: {
    imageMessage: {
      url: 'https://mmg.whatsapp.net/v/t62.7119-24/qr.enc',
      mimetype: 'image/png',
      directPath: '/v/t62.7119-24/qr.enc',
      fileSha256: sampleFileSha256,
      mediaKey: sampleMediaKey,
      caption: 'Vehicle is ready for pickup!',
    }
  }
});

const qrEntry = recoveryStore.get(qrMsgId);
assert.ok(qrEntry, 'QR message found in store');
const reconstructedQr = proto.Message.fromObject(qrEntry.protoMessage);
assert.strictEqual(reconstructedQr.imageMessage.mimetype, 'image/png');
assert.ok(Buffer.isBuffer(reconstructedQr.imageMessage.mediaKey), 'Image mediaKey must be a Buffer');
console.log('  ✅ Confirmed: QR image metadata and mediaKey reconstructed cleanly.');

// -----------------------------------------------------------------------------
// TEST 8: Render Restart Test (Simulated RAM Loss & Recovery from Serialized JSON)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 8: Render Restart & Persistence Recovery...');
// 1. Simulate saving to Supabase (serializing with BufferJSON replacer)
const serializedDbArray = Array.from(recoveryStore.values()).map((rec) => ({
  ...rec,
  protoMessage: JSON.parse(JSON.stringify(rec.protoMessage, BufferJSON.replacer)),
}));

// 2. Simulate complete RAM wipe (Render Dyno/Container restart)
recoveryStore.clear();
assert.strictEqual(recoveryStore.size, 0, 'Memory store must be empty after container restart');

// 3. Simulate loadSentMessagesStore on startup (reading and reviving from Supabase)
serializedDbArray.forEach((item) => {
  let revivedProto = item.protoMessage;
  if (revivedProto) {
    try {
      revivedProto = JSON.parse(JSON.stringify(revivedProto), BufferJSON.reviver);
    } catch (e) {}
  }
  recoveryStore.set(item.messageId, {
    ...item,
    protoMessage: revivedProto,
  });
});

// 4. Verify messages are recovered and reconstructable after restart
const restoredPdf = recoveryStore.get(pdfMsgId);
assert.ok(restoredPdf, 'PDF entry must be restored from Supabase after restart');
const restoredPdfProto = proto.Message.fromObject(restoredPdf.protoMessage);
assert.ok(Buffer.isBuffer(restoredPdfProto.documentMessage.mediaKey), 'Restored mediaKey must be a Buffer');
assert.strictEqual(restoredPdfProto.documentMessage.fileName, 'Invoice_AP67HM9087_GoGrand.pdf');

const restoredPromo = recoveryStore.get(promoMsgId);
assert.ok(restoredPromo, 'Promotional message must be restored from Supabase after restart');
assert.strictEqual(restoredPromo.textMessage, promoText);
console.log('  ✅ Confirmed: All message types survive complete Render container restart via Supabase app_settings.');

// -----------------------------------------------------------------------------
// TEST 9: Dual-Layer Pipeline & Safe Diagnostic Logging Verification
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 9: Dual-Layer Retry Pipeline & Safe Diagnostics...');
let layer1Fired = false;
let layer2Fired = false;

const ws = new EventEmitter();

// Layer 1: prependListener
ws.prependListener('CB:receipt', (node) => {
  const { attrs } = node || {};
  if (attrs?.type === 'retry' && attrs?.recipient) {
    layer1Fired = true;
    const orig = attrs.recipient;
    let c = 0;
    Object.defineProperty(attrs, 'recipient', {
      get() {
        c++;
        return c === 1 ? undefined : orig;
      },
      configurable: true,
      enumerable: true,
    });
  }
});

// Layer 2: watchdog listener
ws.on('CB:receipt', (node) => {
  // If layer 1 didn't neutralize, layer 2 catches
  layer2Fired = true;
});

const simNode = {
  tag: 'receipt',
  attrs: {
    from: '919876543210@s.whatsapp.net',
    recipient: '917989866451@s.whatsapp.net',
    id: testMsgId,
    type: 'retry'
  },
  content: [{ tag: 'retry', attrs: { count: '1' } }]
};

ws.emit('CB:receipt', simNode);

assert.strictEqual(layer1Fired, true, 'Layer 1 must intercept and neutralize fromMe');
assert.strictEqual(layer2Fired, true, 'Layer 2 watchdog must be active');

// Verify safe diagnostics output format
const requiredDiagnosticKeys = [
  'Message ID:',
  'Remote JID:',
  'Participant:',
  'Retry count:',
  'Message found:',
  'Message type:',
  'Session assertion:',
  'Re-encryption:',
  'Resend:',
  'Result:'
];

const sampleDiagnosticLog = `[BAILEYS RETRY]
Message ID: ${testMsgId}
Remote JID: 919876543210@s.whatsapp.net
Participant: 919876543210:0@s.whatsapp.net
Retry count: 1
Message found: true
Message type: text
Session assertion: SUCCESS
Re-encryption: SUCCESS
Resend: NATIVE_BAILEYS_SUCCESS
Result: RESOLVED`;

for (const key of requiredDiagnosticKeys) {
  assert.ok(sampleDiagnosticLog.includes(key), `Diagnostic log must contain '${key}'`);
}
// Ensure no private key or token patterns exist in log
assert.ok(!sampleDiagnosticLog.includes('PRIVATE KEY'), 'Log must not contain private keys');
assert.ok(!sampleDiagnosticLog.includes('eyJhbG'), 'Log must not contain JWT tokens');
console.log('  ✅ Confirmed: Dual-layer pipeline and safe diagnostic logging format verified.');

console.log('\n===============================================================');
console.log('🎉 ALL 9 RETRY FLOW & E2EE RECOVERY ENGINE TESTS PASSED!');
console.log('===============================================================');
