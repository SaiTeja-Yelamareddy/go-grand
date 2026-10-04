/**
 * Focused test for Pre-Transmission Recovery Recording & Immediate Retry Resolution
 *
 * Verifies:
 * 1. Outgoing messages are recorded in sentMessagesStore BEFORE relayMessage transmits stanzas.
 * 2. An immediate retry receipt arriving during relay transmission finds the exact protoMessage.
 * 3. proto.Message.fromObject reconstructs the exact payload without NOT_FOUND_IN_STORE.
 * 4. Post-send recordSentMessage is idempotent (enriches metadata, preserves protoMessage, no duplicates).
 * 5. Text, PDF Invoice, and Image QR message types are correctly handled.
 * 6. Internal control messages, status broadcasts, and retry relays are ignored.
 */

import { proto, generateMessageIDV2 } from '@whiskeysockets/baileys';

// Replicate recovery store and functions matching server/index.js
const sentMessagesStore = new Map();
let saveSentMessagesDebounceTimer = null;

function extractMessageDetails(msg) {
  if (!msg || typeof msg !== 'object') return { type: 'text', text: '' };

  let inner = msg;
  if (inner.ephemeralMessage?.message) inner = inner.ephemeralMessage.message;
  if (inner.viewOnceMessage?.message) inner = inner.viewOnceMessage.message;
  if (inner.viewOnceMessageV2?.message) inner = inner.viewOnceMessageV2.message;
  if (inner.documentWithCaptionMessage?.message) inner = inner.documentWithCaptionMessage.message;

  if (inner.documentMessage) {
    return {
      type: 'pdf',
      text: inner.documentMessage.caption || '',
    };
  }

  if (inner.imageMessage) {
    return {
      type: 'image_qr',
      text: inner.imageMessage.caption || '',
    };
  }

  if (inner.extendedTextMessage) {
    return {
      type: 'text',
      text: inner.extendedTextMessage.text || '',
    };
  }

  if (typeof inner.conversation === 'string') {
    return {
      type: 'text',
      text: inner.conversation,
    };
  }

  return { type: 'text', text: '' };
}

function recordSentMessage(entry) {
  if (!entry || !entry.messageId) return;

  const existing = sentMessagesStore.get(entry.messageId);

  const originalKey = entry.key || {
    id: entry.messageId,
    remoteJid: entry.remoteJid,
    fromMe: true,
    participant: entry.participant || undefined,
  };

  const jobData = entry.job ? {
    id: entry.job.id,
    vehicleNumber: entry.job.vehicleNumber,
    vehicleName: entry.job.vehicleName,
    customerName: entry.job.customerName,
    phoneNumber: entry.job.phoneNumber,
    price: entry.job.price,
    discount: entry.job.discount,
    services: entry.job.services || entry.job.service,
    billNo: entry.job.billNo,
    createdAt: entry.job.createdAt,
  } : (entry.jobData || existing?.jobData || null);

  const record = {
    messageId: entry.messageId,
    remoteJid: entry.remoteJid || existing?.remoteJid,
    key: {
      id: originalKey.id,
      remoteJid: originalKey.remoteJid || existing?.key?.remoteJid,
      fromMe: typeof originalKey.fromMe === 'boolean' ? originalKey.fromMe : (existing?.key?.fromMe ?? true),
      participant: originalKey.participant || existing?.key?.participant || undefined,
    },
    type: entry.type || existing?.type || 'text',
    textMessage: entry.textMessage || existing?.textMessage || '',
    jobId: entry.jobId || entry.job?.id || existing?.jobId || null,
    jobData,
    upiId: entry.upiId || existing?.upiId || null,
    protoMessage: entry.protoMessage || existing?.protoMessage || null,
    timestamp: existing?.timestamp || Date.now(),
  };

  sentMessagesStore.set(entry.messageId, record);

  if (sentMessagesStore.size > 300) {
    const oldestKey = sentMessagesStore.keys().next().value;
    sentMessagesStore.delete(oldestKey);
  }
}

async function getMessageForRetry(key) {
  const msgId = key?.id;
  if (!msgId) return undefined;

  const entry = sentMessagesStore.get(msgId);
  if (!entry) return undefined;

  if (entry.protoMessage) {
    try {
      return proto.Message.fromObject(entry.protoMessage);
    } catch (e) {
      return undefined;
    }
  }

  return proto.Message.fromObject({
    extendedTextMessage: { text: entry.textMessage || '' },
  });
}

// Socket wrapper simulation
function setupMockSocket() {
  const origRelayMessage = async (jid, message, opts) => {
    // Simulate async network wire transmission (20ms latency)
    await new Promise((r) => setTimeout(r, 20));
    return { status: 200 };
  };

  const newSock = {
    user: { id: '918008195435:1@s.whatsapp.net' },
    relayMessage: async (jid, message, opts) => {
      opts = opts || {};
      let finalMsgId = opts.messageId;
      if (!finalMsgId || finalMsgId === 'unknown') {
        if (typeof generateMessageIDV2 === 'function') {
          finalMsgId = generateMessageIDV2(newSock.user?.id);
        }
        if (finalMsgId) opts.messageId = finalMsgId;
      }

      const msgId = opts.messageId || 'unknown';
      const participantJid = opts?.participant?.jid || 'none';
      const retryCount = opts?.participant?.count || 'none';

      const isRetryRelay = Boolean(opts?.participant);
      const isStatusOrBroadcast = typeof jid === 'string' && (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter'));
      const isControlProtocol = Boolean(
        !message || typeof message !== 'object' ||
        message.protocolMessage ||
        message.senderKeyDistributionMessage ||
        message.fastRatchetKeyDistributionMessage ||
        message.peerDataOperationRequestMessage ||
        message.peerDataOperationRequestResponseMessage ||
        message.historySyncNotification ||
        message.appStateSyncKeyShare ||
        message.reactionMessage ||
        message.keepInChatMessage ||
        opts?.additionalAttributes?.category === 'peer'
      );

      const isEligibleForRecovery = !isRetryRelay && !isStatusOrBroadcast && !isControlProtocol && msgId && msgId !== 'unknown';

      if (isEligibleForRecovery) {
        try {
          const details = extractMessageDetails(message);
          recordSentMessage({
            messageId: msgId,
            remoteJid: jid,
            key: {
              id: msgId,
              remoteJid: jid,
              fromMe: true,
              participant: opts?.participant?.jid || undefined,
            },
            type: details.type,
            textMessage: details.text,
            protoMessage: message,
          });
        } catch (err) {}
      }

      return origRelayMessage(jid, message, opts);
    },
  };

  return newSock;
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 PRE-TRANSMISSION RECOVERY & IMMEDIATE RETRY LOOKUP TEST');
  console.log('===============================================================');

  const sock = setupMockSocket();

  // Test 1: Immediate retry during wire transmission of text message
  console.log('\n--- Test 1: Text Message Pre-Transmission & Immediate Retry ---');
  const msgId1 = '3EB06A3FC2DD66C8389A8C';
  const targetJid1 = '919876543210@s.whatsapp.net';
  const textPayload = { extendedTextMessage: { text: 'Hello from GO GRAND car care!' } };

  let retryFoundDuringRelay = false;
  let reconstructedMsg1 = null;

  // Start relay in flight (takes 20ms)
  const relayPromise1 = sock.relayMessage(targetJid1, textPayload, { messageId: msgId1 });

  // Simulate recipient phone sending retry receipt 2ms after transmission starts
  // (BEFORE relayPromise1 completes)
  await new Promise((r) => setTimeout(r, 2));

  const memEntry1 = sentMessagesStore.get(msgId1);
  if (memEntry1) {
    retryFoundDuringRelay = true;
    reconstructedMsg1 = await getMessageForRetry({ id: msgId1, remoteJid: targetJid1 });
  }

  await relayPromise1;

  if (!retryFoundDuringRelay) {
    throw new Error('FAILED: Message was NOT found in recovery store during in-flight relay!');
  }
  if (!reconstructedMsg1 || reconstructedMsg1.extendedTextMessage?.text !== 'Hello from GO GRAND car care!') {
    throw new Error('FAILED: ProtoMessage reconstruction mismatch during immediate retry!');
  }
  console.log('  ✅ In-flight lookup succeeded: Message was present before wire transmission completed.');
  console.log(`  ✅ Reconstructed text: "${reconstructedMsg1.extendedTextMessage.text}"`);

  // Test 2: Idempotent enrichment post-send
  console.log('\n--- Test 2: Post-Send Idempotency & Metadata Enrichment ---');
  const initialStoreSize = sentMessagesStore.size;

  recordSentMessage({
    messageId: msgId1,
    remoteJid: targetJid1,
    key: { id: msgId1, remoteJid: targetJid1, fromMe: true },
    type: 'text',
    textMessage: 'Hello from GO GRAND car care!',
    job: {
      id: 'job-999',
      vehicleNumber: 'AP01AB1234',
      customerName: 'Suresh Kumar',
      price: 1500,
    },
    upiId: 'gogrand@okicici',
    protoMessage: textPayload,
  });

  if (sentMessagesStore.size !== initialStoreSize) {
    throw new Error(`FAILED: Store size increased from ${initialStoreSize} to ${sentMessagesStore.size} (duplicate created)!`);
  }
  const enrichedEntry = sentMessagesStore.get(msgId1);
  if (!enrichedEntry.jobData || enrichedEntry.jobData.vehicleNumber !== 'AP01AB1234') {
    throw new Error('FAILED: Job data was not merged into recovery entry!');
  }
  if (enrichedEntry.upiId !== 'gogrand@okicici') {
    throw new Error('FAILED: UPI ID was not merged into recovery entry!');
  }
  if (!enrichedEntry.protoMessage) {
    throw new Error('FAILED: ProtoMessage was lost during enrichment!');
  }
  console.log('  ✅ Idempotency confirmed: No duplicate records created.');
  console.log(`  ✅ Metadata enriched: Vehicle ${enrichedEntry.jobData.vehicleNumber}, Customer ${enrichedEntry.jobData.customerName}, UPI ${enrichedEntry.upiId}`);

  // Test 3: Invoice PDF Document Message
  console.log('\n--- Test 3: Invoice PDF Pre-Transmission & Immediate Retry ---');
  const msgId2 = '3EB0PDF_INVOICE_TEST_001';
  const targetJid2 = '919876543210@s.whatsapp.net';
  const pdfPayload = {
    documentMessage: {
      url: 'https://mmg.whatsapp.net/v/t62.7118-24/...',
      mimetype: 'application/pdf',
      fileName: 'Invoice_AP01AB1234_GoGrand.pdf',
      fileSha256: Buffer.from('test-sha-256'),
      fileLength: 254138,
      caption: 'Thank you for choosing GO GRAND! Attached is your invoice.',
    },
  };

  const relayPromise2 = sock.relayMessage(targetJid2, pdfPayload, { messageId: msgId2 });
  await new Promise((r) => setTimeout(r, 2));

  const reconstructedPdf = await getMessageForRetry({ id: msgId2, remoteJid: targetJid2 });
  await relayPromise2;

  if (!reconstructedPdf || !reconstructedPdf.documentMessage) {
    throw new Error('FAILED: Document protoMessage not reconstructed!');
  }
  if (reconstructedPdf.documentMessage.fileName !== 'Invoice_AP01AB1234_GoGrand.pdf') {
    throw new Error('FAILED: Document fileName mismatch in reconstructed protoMessage!');
  }
  console.log('  ✅ In-flight PDF lookup succeeded!');
  console.log(`  ✅ Reconstructed PDF fileName: "${reconstructedPdf.documentMessage.fileName}"`);
  console.log(`  ✅ Reconstructed PDF caption: "${reconstructedPdf.documentMessage.caption}"`);

  // Test 4: Image QR Message
  console.log('\n--- Test 4: Image QR Pre-Transmission & Immediate Retry ---');
  const msgId3 = '3EB0IMAGE_QR_TEST_002';
  const imgPayload = {
    imageMessage: {
      url: 'https://mmg.whatsapp.net/v/t62.7118-24/...',
      mimetype: 'image/png',
      caption: 'Please scan QR to pay Rs. 1500 for vehicle AP01AB1234.',
    },
  };

  const relayPromise3 = sock.relayMessage(targetJid1, imgPayload, { messageId: msgId3 });
  await new Promise((r) => setTimeout(r, 2));

  const reconstructedImg = await getMessageForRetry({ id: msgId3, remoteJid: targetJid1 });
  await relayPromise3;

  if (!reconstructedImg || !reconstructedImg.imageMessage) {
    throw new Error('FAILED: Image QR protoMessage not reconstructed!');
  }
  console.log('  ✅ In-flight Image QR lookup succeeded!');
  console.log(`  ✅ Reconstructed image caption: "${reconstructedImg.imageMessage.caption}"`);

  // Test 5: Ineligible Messages (protocol, status, retry relay)
  console.log('\n--- Test 5: Ineligible Messages Filtered Out ---');
  const preCount = sentMessagesStore.size;

  // 5a: Status broadcast
  await sock.relayMessage('status@broadcast', { conversation: 'Status update' }, { messageId: 'STATUS_MSG' });
  if (sentMessagesStore.has('STATUS_MSG')) throw new Error('FAILED: Status broadcast should not be stored!');

  // 5b: Control protocol message
  await sock.relayMessage(targetJid1, { protocolMessage: { type: 1 } }, { messageId: 'PROTO_MSG' });
  if (sentMessagesStore.has('PROTO_MSG')) throw new Error('FAILED: Protocol control message should not be stored!');

  // 5c: Retry relay (opts.participant present)
  await sock.relayMessage(targetJid1, { conversation: 'Resend' }, { messageId: 'RETRY_RELAY_MSG', participant: { jid: '22128225194116@lid', count: 1 } });
  if (sentMessagesStore.has('RETRY_RELAY_MSG')) throw new Error('FAILED: Retry relay should not create new store entry!');

  if (sentMessagesStore.size !== preCount) {
    throw new Error('FAILED: Ineligible message was recorded in recovery store!');
  }
  console.log('  ✅ Ineligible messages correctly ignored (status broadcast, protocol, retry relay).');

  console.log('\n===============================================================');
  console.log('🎉 ALL 5 PRE-TRANSMISSION RECOVERY TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
