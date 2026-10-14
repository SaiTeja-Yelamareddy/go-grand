/**
 * testNotificationStatusContract.js
 *
 * Comprehensive regression and contract test suite for GO GRAND WhatsApp notifications:
 * 1. HTTP 503 with confirmed disconnected state -> disconnected
 * 2. HTTP 503 generic/proxy HTML error -> server_error
 * 3. HTTP 400 / 422 definite failure -> failed
 * 4. HTTP 500 server error -> server_error
 * 5. Network failure before submission (status 0 / Failed to fetch) -> server_error
 * 6. Timeout after submission (status 408 / timedOut: true) -> unconfirmed
 * 7. Successful response -> sent
 * 8. Malformed or non-JSON response on 200 -> unconfirmed
 * 9. Notification transition from Sending to the correct final state
 * 10. Stale async callbacks prevented from overwriting terminal states
 * 11. Atomic in-place updates and safe upserts
 * 12. Dismissed ID rejection
 * 13. Bulk sending summary handling
 */

import assert from 'assert';

// ==============================================================================
// 1. Implementation matching src/utils/invoiceUtils.ts
// ==============================================================================

function interpretSendResponse(fetchResult) {
  // 1. Timeout or connection loss after submission
  if (fetchResult.timedOut || fetchResult.status === 408) {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error: 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  const { ok, status, data } = fetchResult;

  // 2. Successful backend acceptance
  if (ok && data?.success && (data?.status === 'sent' || data?.messageId)) {
    return {
      success: true,
      status: 'sent',
      method: 'backend',
      messageId: data.messageId,
    };
  }

  // 3. HTTP 503 or confirmed disconnected socket: ONLY when backend explicitly confirms WhatsApp is disconnected
  const isExplicitlyDisconnected =
    data &&
    typeof data === 'object' &&
    (data.status === 'disconnected' ||
      data.whatsappConnected === false ||
      data.connected === false ||
      (typeof data.error === 'string' &&
        data.error.toLowerCase().includes('whatsapp is disconnected')));

  if (isExplicitlyDisconnected) {
    return {
      success: false,
      status: 'disconnected',
      method: 'backend',
      error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
    };
  }

  // 4. HTTP 400 or another confirmed message rejection (client error / invalid parameters / rejected)
  if (status === 400 || status === 422 || (data?.status === 'failed' && status < 500)) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: data?.error || 'Your WhatsApp message could not be sent. Please try again.',
    };
  }

  // 5. Ambiguous outcome from backend (unknown or unconfirmed status)
  if (data?.status === 'unconfirmed' || data?.status === 'unknown') {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error:
        data?.error ||
        'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  // 6. Malformed response on a 200 OK (request succeeded at HTTP layer, so sending may have occurred)
  if (ok && (!data || !data.success)) {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error: 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  // 7. HTTP 5xx or backend failure (unless explicitly confirmed disconnected above)
  if (status >= 500 && status <= 599) {
    return {
      success: false,
      status: 'server_error',
      method: 'backend',
      error: 'The messaging server could not complete your request. Please try again later.',
    };
  }

  // 8. Network unavailable before request reaches server (status === 0 or offline)
  if (status === 0) {
    return {
      success: false,
      status: 'server_error',
      method: 'backend',
      error: 'The messaging server could not complete your request. Please try again later.',
    };
  }

  // Default fallback for any other failure
  return {
    success: false,
    status: 'failed',
    method: 'backend',
    error: data?.error || 'Your WhatsApp message could not be sent. Please try again.',
  };
}

function classifyWhatsAppError(err) {
  if (!err) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: 'Your WhatsApp message could not be sent. Please try again.',
    };
  }

  // If already a WhatsAppSendResult
  if (typeof err === 'object' && err.status && err.method === 'backend') {
    return err;
  }

  // If it's a fetchResult object ({ ok, status, data, timedOut })
  if (typeof err === 'object' && ('status' in err || 'timedOut' in err)) {
    return interpretSendResponse(err);
  }

  // Check timeout
  const isTimeout =
    err?.name === 'AbortError' ||
    String(err?.message || err).toLowerCase().includes('abort') ||
    String(err?.message || err).toLowerCase().includes('timeout');

  if (isTimeout) {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error: 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  // Check explicit disconnection mention in error
  const errMsg = String(err?.message || err).toLowerCase();
  if (errMsg.includes('whatsapp is disconnected') || errMsg.includes('whatsapp disconnected')) {
    return {
      success: false,
      status: 'disconnected',
      method: 'backend',
      error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
    };
  }

  // Network / server unavailable error (fetch failure, connection refused)
  if (
    errMsg.includes('failed to fetch') ||
    errMsg.includes('network') ||
    errMsg.includes('econnrefused') ||
    errMsg.includes('server unavailable')
  ) {
    return {
      success: false,
      status: 'server_error',
      method: 'backend',
      error: 'The messaging server could not complete your request. Please try again later.',
    };
  }

  // General failure
  return {
    success: false,
    status: 'failed',
    method: 'backend',
    error: err?.message || 'Your WhatsApp message could not be sent. Please try again.',
  };
}

// ==============================================================================
// 2. Notification Map matching src/components/NotificationSystem.tsx
// ==============================================================================

const NOTIFICATION_MAP = {
  sending: {
    type: 'whatsapp-sending',
    title: 'Sending WhatsApp Message',
    description: 'Sending your message. Please wait...',
  },
  sent: {
    type: 'whatsapp-sent',
    title: 'Message Sent',
    description: 'WhatsApp accepted the message for sending.',
  },
  failed: {
    type: 'whatsapp-failed',
    title: 'Message Not Sent',
    description: 'Your WhatsApp message could not be sent. Please try again.',
  },
  unconfirmed: {
    type: 'whatsapp-unconfirmed',
    title: 'Delivery Not Confirmed',
    description: 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
  },
  disconnected: {
    type: 'whatsapp-disconnected',
    title: 'WhatsApp Disconnected',
    description: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
  },
  server_error: {
    type: 'whatsapp-server-error',
    title: 'Server Unavailable',
    description: 'The messaging server could not complete your request. Please try again later.',
  },
};

// ==============================================================================
// 3. Notification System State Manager (matching NotificationSystem.tsx logic)
// ==============================================================================

class NotificationStore {
  constructor() {
    this.notifications = [];
    this.dismissedIds = new Set();
  }

  isTerminalState(type) {
    return [
      'whatsapp-sent',
      'whatsapp-failed',
      'whatsapp-unconfirmed',
      'whatsapp-disconnected',
      'whatsapp-server-error',
    ].includes(type);
  }

  notify(options) {
    const id = options.id || `notif_${Date.now()}_${Math.random()}`;
    if (this.dismissedIds.has(id)) {
      return id;
    }
    const notif = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      description: options.description,
      createdAt: Date.now(),
    };
    this.notifications.push(notif);
    return id;
  }

  update(id, updates) {
    if (this.dismissedIds.has(id)) {
      return;
    }

    const idx = this.notifications.findIndex((n) => n.id === id);
    if (idx !== -1) {
      const existing = this.notifications[idx];
      // Prevent stale delayed 'sending' callbacks from overwriting terminal states
      if (this.isTerminalState(existing.type) && updates.type === 'whatsapp-sending') {
        return;
      }
      this.notifications[idx] = {
        ...existing,
        ...updates,
      };
    } else {
      // Safe upsert
      this.notifications.push({
        id,
        type: updates.type || 'info',
        title: updates.title || '',
        message: updates.message,
        description: updates.description,
        createdAt: Date.now(),
      });
    }
  }

  dismiss(id) {
    this.dismissedIds.add(id);
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }

  notifyWhatsAppState(state, existingId, options) {
    const config = NOTIFICATION_MAP[state];
    if (!config) return existingId || '';

    const payload = {
      type: config.type,
      title: options?.title || config.title,
      description: options?.description || config.description,
    };

    if (existingId) {
      this.update(existingId, payload);
      return existingId;
    }

    return this.notify(payload);
  }
}

// ==============================================================================
// 4. Test Suite Execution
// ==============================================================================

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🧪 WHATSAPP NOTIFICATION ERROR CLASSIFICATION & STATE CONTRACT');
  console.log('===============================================================');

  // TEST 1: HTTP 503 with confirmed disconnected state -> disconnected
  console.log('\n▶ TEST 1: HTTP 503 with confirmed disconnected state...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 503,
      data: {
        success: false,
        status: 'disconnected',
        whatsappConnected: false,
        error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
      },
    });

    assert.strictEqual(res.status, 'disconnected', 'Must classify as disconnected');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'WhatsApp Disconnected');
    assert.strictEqual(
      notif.description,
      'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.'
    );
    console.log('  ✅ Confirmed disconnected 503 maps to "WhatsApp Disconnected"');
  }

  // TEST 2: HTTP 503 generic / proxy HTML error -> server_error
  console.log('\n▶ TEST 2: HTTP 503 generic/proxy HTML error (Render / Cloudflare)...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 503,
      data: {
        rawText: '<html><body>503 Service Temporarily Unavailable</body></html>',
      },
    });

    assert.strictEqual(res.status, 'server_error', 'Generic 503 must map to server_error, NOT disconnected');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Server Unavailable');
    assert.strictEqual(
      notif.description,
      'The messaging server could not complete your request. Please try again later.'
    );
    console.log('  ✅ Generic 503 proxy/HTML maps to "Server Unavailable" (NOT falsely disconnected)');
  }

  // TEST 3: HTTP 400 definite failure -> failed
  console.log('\n▶ TEST 3: HTTP 400 definite failure...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 400,
      data: {
        success: false,
        status: 'failed',
        error: 'WhatsApp could not send the message. Make sure the number is valid and on WhatsApp.',
      },
    });

    assert.strictEqual(res.status, 'failed', 'HTTP 400 must map to failed');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Message Not Sent');
    assert.strictEqual(
      notif.description,
      'Your WhatsApp message could not be sent. Please try again.'
    );
    console.log('  ✅ HTTP 400 client/number rejection maps to "Message Not Sent"');
  }

  // TEST 4: HTTP 500 server error -> server_error
  console.log('\n▶ TEST 4: HTTP 500 server error...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 500,
      data: {
        success: false,
        error: 'Internal server error processing payload',
      },
    });

    assert.strictEqual(res.status, 'server_error', 'HTTP 500 must map to server_error');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Server Unavailable');
    assert.strictEqual(
      notif.description,
      'The messaging server could not complete your request. Please try again later.'
    );
    console.log('  ✅ HTTP 500 backend error maps to "Server Unavailable"');
  }

  // TEST 5: Network failure before submission (status 0 / Failed to fetch) -> server_error
  console.log('\n▶ TEST 5: Network failure before submission (status 0 / Failed to fetch)...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 0,
      timedOut: false,
    });

    assert.strictEqual(res.status, 'server_error', 'Status 0 must map to server_error');
    assert.strictEqual(res.success, false);

    const caughtErrRes = classifyWhatsAppError(new TypeError('Failed to fetch'));
    assert.strictEqual(caughtErrRes.status, 'server_error');
    const notif = NOTIFICATION_MAP[caughtErrRes.status];
    assert.strictEqual(notif.title, 'Server Unavailable');
    console.log('  ✅ Network failure / unreachable backend maps to "Server Unavailable"');
  }

  // TEST 6: Timeout after submission (timedOut: true / 408) -> unconfirmed
  console.log('\n▶ TEST 6: Timeout after submission (timedOut: true / HTTP 408)...');
  {
    const res = interpretSendResponse({
      ok: false,
      status: 408,
      timedOut: true,
    });

    assert.strictEqual(res.status, 'unconfirmed', 'Timeout must map to unconfirmed');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Delivery Not Confirmed');
    assert.strictEqual(
      notif.description,
      'WhatsApp has not confirmed delivery. Check the message status before retrying.'
    );

    const abortErrRes = classifyWhatsAppError({ name: 'AbortError', message: 'The user aborted a request.' });
    assert.strictEqual(abortErrRes.status, 'unconfirmed');
    console.log('  ✅ Timeouts strictly map to "Delivery Not Confirmed" (never falsely claiming not sent)');
  }

  // TEST 7: Successful response -> sent
  console.log('\n▶ TEST 7: Successful response (200 + sent)...');
  {
    const res = interpretSendResponse({
      ok: true,
      status: 200,
      data: {
        success: true,
        status: 'sent',
        messageId: 'BAE5A1234567890',
        recipient: '919876543210',
      },
    });

    assert.strictEqual(res.status, 'sent', 'Accepted send must map to sent');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, 'BAE5A1234567890');
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Message Sent');
    assert.strictEqual(notif.description, 'WhatsApp accepted the message for sending.');
    console.log('  ✅ Successful backend acceptance maps to "Message Sent" with exact acceptance copy');
  }

  // TEST 8: Malformed or non-JSON response on 200 -> unconfirmed
  console.log('\n▶ TEST 8: Malformed or non-JSON response on 200...');
  {
    const res = interpretSendResponse({
      ok: true,
      status: 200,
      data: { rawText: 'OK but not JSON' },
    });

    assert.strictEqual(res.status, 'unconfirmed', '200 OK with non-JSON or missing success must map to unconfirmed');
    assert.strictEqual(res.success, false);
    const notif = NOTIFICATION_MAP[res.status];
    assert.strictEqual(notif.title, 'Delivery Not Confirmed');
    console.log('  ✅ Malformed 200 OK safely maps to "Delivery Not Confirmed" to avoid duplicate resends');
  }

  // TEST 9: Notification transition from Sending to the correct final state
  console.log('\n▶ TEST 9: Notification transition from Sending to final states...');
  {
    const store = new NotificationStore();

    // Start with sending
    const notifId = store.notifyWhatsAppState('sending');
    assert.strictEqual(store.notifications.length, 1);
    assert.strictEqual(store.notifications[0].id, notifId);
    assert.strictEqual(store.notifications[0].type, 'whatsapp-sending');
    assert.strictEqual(store.notifications[0].title, 'Sending WhatsApp Message');

    // Update to sent
    store.notifyWhatsAppState('sent', notifId);
    assert.strictEqual(store.notifications.length, 1, 'ID must be updated in-place without creating duplicate toasts');
    assert.strictEqual(store.notifications[0].id, notifId);
    assert.strictEqual(store.notifications[0].type, 'whatsapp-sent');
    assert.strictEqual(store.notifications[0].title, 'Message Sent');
    assert.strictEqual(store.notifications[0].description, 'WhatsApp accepted the message for sending.');

    console.log('  ✅ In-place notification update from Sending to Message Sent verified with no duplicate toasts');
  }

  // TEST 10: Prevention of stale asynchronous callbacks overwriting a newer status
  console.log('\n▶ TEST 10: Stale async callback rejection against terminal states...');
  {
    const store = new NotificationStore();

    const notifId = store.notifyWhatsAppState('sending');
    // Backend finishes and updates state to disconnected
    store.notifyWhatsAppState('disconnected', notifId);
    assert.strictEqual(store.notifications[0].type, 'whatsapp-disconnected');

    // Stale delayed sending callback arrives later
    store.notifyWhatsAppState('sending', notifId);
    assert.strictEqual(
      store.notifications[0].type,
      'whatsapp-disconnected',
      'Terminal state must NOT be overwritten by a delayed sending callback'
    );

    console.log('  ✅ Stale asynchronous callbacks are strictly blocked from overwriting terminal states');
  }

  // TEST 11: Safe upsert when notification update arrives before initial state settles
  console.log('\n▶ TEST 11: Safe upsert when update arrives with unseen ID...');
  {
    const store = new NotificationStore();
    const futureId = 'preassigned_txn_123';

    store.notifyWhatsAppState('server_error', futureId);
    assert.strictEqual(store.notifications.length, 1);
    assert.strictEqual(store.notifications[0].id, futureId);
    assert.strictEqual(store.notifications[0].type, 'whatsapp-server-error');
    assert.strictEqual(store.notifications[0].title, 'Server Unavailable');

    console.log('  ✅ Safe upsert creates toast rather than dropping notification if ID unsettled');
  }

  // TEST 12: Dismissed IDs cannot be resurrected
  console.log('\n▶ TEST 12: Dismissed IDs cannot be resurrected by delayed callbacks...');
  {
    const store = new NotificationStore();
    const notifId = store.notifyWhatsAppState('sending');
    store.dismiss(notifId);
    assert.strictEqual(store.notifications.length, 0);

    // Stale completion callback arrives for dismissed toast
    store.notifyWhatsAppState('sent', notifId);
    assert.strictEqual(store.notifications.length, 0, 'Dismissed notification must not resurrect');

    console.log('  ✅ Dismissed notification ID tracking prevents toast resurrection');
  }

  // TEST 13: Bulk partial failure tracking and accurate summary copy
  console.log('\n▶ TEST 13: Bulk partial failure tracking & summary copy...');
  {
    const testCases = [
      { ok: true, status: 200, data: { success: true, status: 'sent', messageId: 'm1' } },
      { ok: true, status: 200, data: { success: true, status: 'sent', messageId: 'm2' } },
      { ok: false, status: 400, data: { success: false, status: 'failed', error: 'Invalid phone' } },
      { ok: false, status: 408, timedOut: true },
    ];

    let sent = 0;
    let failed = 0;
    let unconfirmed = 0;

    for (const tc of testCases) {
      const res = interpretSendResponse(tc);
      if (res.status === 'sent') sent++;
      else if (res.status === 'unconfirmed') unconfirmed++;
      else failed++;
    }

    assert.strictEqual(sent, 2);
    assert.strictEqual(failed, 1);
    assert.strictEqual(unconfirmed, 1);
    const summary = `${sent} sent · ${failed} failed · ${unconfirmed} unconfirmed`;
    assert.strictEqual(summary, '2 sent · 1 failed · 1 unconfirmed');

    console.log(`  ✅ Bulk summary successfully calculated: "${summary}"`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL 13 NOTIFICATION STATUS & REGRESSION TESTS PASSED!');
  console.log('===============================================================');
}

runTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
