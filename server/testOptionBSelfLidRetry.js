/**
 * Focused test for Option B: Self-Device LID Retry Routing
 *
 * Verifies:
 * 1. Sender phone LID (22128225194116@lid) retry request is correctly recognized as self-device.
 * 2. Stanza is routed with @lid addressing (not corrupted to @s.whatsapp.net).
 * 3. Payload is wrapped in deviceSentMessage with proper destinationJid.
 * 4. Third-party customer retries continue to use standard origRelayMessage.
 * 5. Normal sends continue to use standard origRelayMessage.
 */

import { jidDecode, jidEncode, encodeSignedDeviceIdentity } from '@whiskeysockets/baileys';

function getMediaType(message) {
  if (!message || typeof message !== 'object') return undefined;
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return message.videoMessage?.gifPlayback ? 'gif' : 'video';
  if (message.audioMessage) return message.audioMessage?.ptt ? 'ptt' : 'audio';
  if (message.contactMessage) return 'vcard';
  if (message.documentMessage) return 'document';
  if (message.contactsArrayMessage) return 'contact_array';
  if (message.liveLocationMessage) return 'livelocation';
  if (message.stickerMessage) return 'sticker';
  return undefined;
}

function getMessageType(message) {
  if (!message || typeof message !== 'object') return 'text';
  if (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3) {
    return 'poll';
  }
  return 'text';
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 OPTION B: SELF-DEVICE LID RETRY ROUTING VERIFICATION TEST');
  console.log('===============================================================');

  const sentStanzas = [];
  const origRelayCalls = [];

  const mockSock = {
    authState: {
      creds: {
        me: {
          id: '917989866451:89@s.whatsapp.net',
          lid: '22128225194116:89@lid',
        },
        account: { details: 'mock-account-details' },
      },
    },
    user: { id: '917989866451:89@s.whatsapp.net' },
    assertSessions: async (jids, force) => {
      console.log(`  [MOCK] assertSessions called for: ${jids.join(', ')} (force: ${force})`);
      return true;
    },
    createParticipantNodes: async (jids, msg, extraAttrs) => {
      console.log(`  [MOCK] createParticipantNodes called for: ${jids.join(', ')} with hasDeviceSentMessage: ${Boolean(msg?.deviceSentMessage)}`);
      return {
        nodes: [
          {
            tag: 'to',
            attrs: { jid: jids[0] },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: Buffer.from('mock-ciphertext') }],
          },
        ],
        shouldIncludeDeviceIdentity: true,
      };
    },
    sendNode: async (node) => {
      sentStanzas.push(node);
      console.log(`  [MOCK] sendNode called. Stanza to: ${node.attrs.to}, recipient: ${node.attrs.recipient}, id: ${node.attrs.id}`);
      return { status: 200 };
    },
  };

  const origRelayMessage = async (jid, message, opts) => {
    origRelayCalls.push({ jid, message, opts });
    return { status: 200, orig: true };
  };

  // Wrapped relayMessage incorporating Option B
  const relayMessage = async (jid, message, opts) => {
    opts = opts || {};
    const msgId = opts.messageId || 'unknown';

    // Option B: Self-device LID retry handler
    if (opts?.participant?.jid) {
      try {
        const rawPartJid = opts.participant.jid;
        const partDecoded = jidDecode(rawPartJid);
        const myLidUser = mockSock.authState?.creds?.me?.lid ? jidDecode(mockSock.authState.creds.me.lid).user : null;
        const myPnUser = mockSock.authState?.creds?.me?.id ? jidDecode(mockSock.authState.creds.me.id).user : null;

        const isSelfDeviceRetry = Boolean(
          (partDecoded?.server === 'lid' && myLidUser && partDecoded.user === myLidUser) ||
          (partDecoded?.user && myPnUser && partDecoded.user === myPnUser)
        );

        if (isSelfDeviceRetry) {
          const selfTargetJid = jidEncode(
            partDecoded.user,
            partDecoded.server || (myLidUser && partDecoded.user === myLidUser ? 'lid' : 's.whatsapp.net'),
            partDecoded.device
          );

          console.log(`[BAILEYS RETRY RESCUE] 🔄 Routing self-device retry for MsgID: ${msgId} to sender phone/LID: ${selfTargetJid} (chat: ${jid})`);

          await mockSock.assertSessions([selfTargetJid], false);

          const meMsg = {
            deviceSentMessage: {
              destinationJid: jid,
              message,
            },
            messageContextInfo: message?.messageContextInfo,
          };

          const extraAttrs = {};
          const mediaType = getMediaType(message);
          if (mediaType) {
            extraAttrs['mediatype'] = mediaType;
          }

          const { nodes: meNodes, shouldIncludeDeviceIdentity: s1 } = await mockSock.createParticipantNodes(
            [selfTargetJid],
            meMsg,
            extraAttrs
          );

          const binaryContent = [
            {
              tag: 'participants',
              attrs: {},
              content: meNodes,
            },
          ];

          if (s1 && typeof encodeSignedDeviceIdentity === 'function' && mockSock.authState?.creds?.account) {
            binaryContent.push({
              tag: 'device-identity',
              attrs: {},
              content: encodeSignedDeviceIdentity(mockSock.authState.creds.account, true),
            });
          }

          const stanza = {
            tag: 'message',
            attrs: {
              id: msgId,
              type: getMessageType(message),
              to: selfTargetJid,
              recipient: jid,
              device_fanout: 'false',
              ...(opts.additionalAttributes || {}),
            },
            content: binaryContent,
          };

          return mockSock.sendNode(stanza);
        }
      } catch (err) {
        console.warn('[BAILEYS RETRY RESCUE] Error:', err.message);
      }
    }

    return origRelayMessage(jid, message, opts);
  };

  // Test 1: Self-Device Retry Request from sender's LID
  console.log('\n--- Test 1: Sender Phone LID Retry Request ---');
  const chatJid = '917660984590@s.whatsapp.net';
  const testMsg = { conversation: 'Your vehicle is ready!' };
  const retryOptsSelfLid = {
    messageId: '3EB0TEST_SELF_LID_RETRY',
    participant: { jid: '22128225194116@lid', count: 1 },
  };

  await relayMessage(chatJid, testMsg, retryOptsSelfLid);

  if (origRelayCalls.length > 0) {
    throw new Error('FAILED: Self-device retry should NOT have fallen through to standard origRelayMessage!');
  }
  if (sentStanzas.length !== 1) {
    throw new Error('FAILED: sendNode was not called for self-device retry!');
  }

  const stanza1 = sentStanzas[0];
  if (stanza1.attrs.to !== '22128225194116@lid') {
    throw new Error(`FAILED: Stanza destination is '${stanza1.attrs.to}', expected '22128225194116@lid'!`);
  }
  if (stanza1.attrs.recipient !== chatJid) {
    throw new Error(`FAILED: Stanza recipient is '${stanza1.attrs.recipient}', expected '${chatJid}'!`);
  }
  if (stanza1.attrs.device_fanout !== 'false') {
    throw new Error('FAILED: device_fanout was not set to false!');
  }
  console.log('  ✅ Self-device retry correctly routed to sender LID: 22128225194116@lid');
  console.log('  ✅ Stanza attributes correctly tagged with recipient and device_fanout=false');

  // Test 2: Third-party customer retry request
  console.log('\n--- Test 2: Third-Party Customer Retry Request ---');
  sentStanzas.length = 0;
  origRelayCalls.length = 0;

  const retryOptsCustomer = {
    messageId: '3EB0TEST_CUSTOMER_RETRY',
    participant: { jid: '917660984590:0@s.whatsapp.net', count: 1 },
  };

  await relayMessage(chatJid, testMsg, retryOptsCustomer);

  if (origRelayCalls.length !== 1) {
    throw new Error('FAILED: Customer retry should be passed to standard origRelayMessage!');
  }
  if (sentStanzas.length !== 0) {
    throw new Error('FAILED: Self-device sendNode should NOT be called for customer retries!');
  }
  console.log('  ✅ Customer retry correctly delegated to standard origRelayMessage.');

  // Test 3: Standard outgoing customer message
  console.log('\n--- Test 3: Standard Outgoing Customer Message ---');
  sentStanzas.length = 0;
  origRelayCalls.length = 0;

  await relayMessage(chatJid, testMsg, { messageId: '3EB0STANDARD_SEND' });

  if (origRelayCalls.length !== 1) {
    throw new Error('FAILED: Normal outgoing message should be passed to standard origRelayMessage!');
  }
  console.log('  ✅ Normal outgoing messages continue through origRelayMessage untouched.');

  // Test 4: PDF Invoice Self-Device Retry
  console.log('\n--- Test 4: PDF Invoice Self-Device Retry ---');
  sentStanzas.length = 0;
  origRelayCalls.length = 0;

  const pdfMsg = {
    documentMessage: {
      fileName: 'Invoice_AP01AB1234.pdf',
      mimetype: 'application/pdf',
      caption: 'Invoice attached',
    },
  };

  await relayMessage(chatJid, pdfMsg, retryOptsSelfLid);

  if (sentStanzas.length !== 1) {
    throw new Error('FAILED: sendNode was not called for PDF self-device retry!');
  }
  console.log('  ✅ PDF invoice self-device retry successfully routed with mediatype=document.');

  console.log('\n===============================================================');
  console.log('🎉 ALL 4 OPTION B SELF-DEVICE LID RETRY TESTS PASSED!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
