import express from 'express';
import cors from 'cors';
import http from 'http';
import dns from 'dns';
import { Server as SocketIOServer } from 'socket.io';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateInvoicePDF } from './pdfGenerator.js';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import { useSupabaseAuthState, getAuthStateDiagnostics } from './supabaseAuth.js';
import {
  getDatabaseUsageMetrics,
  createDatabaseBackup,
  listBackups,
  getBackupSummary,
  initBackupScheduler,
} from './backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server or root .env
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

process.on('uncaughtException', (err) => {
  console.warn('⚠️ Uncaught exception caught:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Unhandled rejection caught:', reason);
});

// Fix invalid system TMPDIR
const projectTmpDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(projectTmpDir)) {
  fs.mkdirSync(projectTmpDir, { recursive: true });
}
process.env.TMPDIR = projectTmpDir;
process.env.TMP = projectTmpDir;
process.env.TEMP = projectTmpDir;
os.tmpdir = () => projectTmpDir;

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Supabase Configuration for WhatsApp Session State
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://bpsnequgqdqofpsrcvne.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwc25lcXVncWRxb2Zwc3Jjdm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU3NjMsImV4cCI6MjEwMzg0MTc2M30.3blNafEzTPMNgzBtDg7k2dJLa91_gpI3h1kpbKkDCQ8';
const WHATSAPP_SESSION_ID = process.env.WHATSAPP_SESSION_ID || 'go-grand-session';

console.log(`🌐 [WHATSAPP SUPABASE PERSISTENCE] Initializing Supabase client (${SUPABASE_URL}) for session: '${WHATSAPP_SESSION_ID}'`);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
  },
});

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  },
});

// Authorization Middleware for Sensitive WhatsApp Control Endpoints
const API_SECRET = process.env.WHATSAPP_API_SECRET;
function requireApiAuth(req, res, next) {
  if (API_SECRET) {
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (token !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API secret token.' });
    }
  }
  next();
}

let sock = null;
let currentQrCode = null;
let isConnected = false;
let connectedUser = null;
let isConnecting = false;
let reconnectTimer = null;
let socketInstanceId = 0;
let reconnectAttempts = 0;
let lastConnectedAt = null;
let lastDisconnectAt = null;
let lastDisconnectReason = null;
let lastDisconnectCode = null;
let lastReconnectAt = null;
let hasPersistedCreds = false;
let authHandle = null;

const logger = pino({ level: 'silent' }); // Silent pino to prevent noisy internal logs
const httpsAgent = new https.Agent({ keepAlive: true });

async function connectToWhatsApp(force = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (isConnected && !force) {
    console.log(`[BAILEYS] ℹ️ Already connected as ${connectedUser}. Reusing existing socket.`);
    return;
  }

  if (isConnecting && !force) {
    console.log('[BAILEYS] ⏳ Connection already in progress. Reusing in-flight connection.');
    return;
  }

  isConnecting = true;
  const currentInstance = ++socketInstanceId;
  console.log(`[BAILEYS] 🔌 Initializing WhatsApp Baileys socket (Generation #${currentInstance})...`);
  io.emit('status', { status: 'connecting', connected: false });

  // Safely clean up previous socket listeners
  if (sock) {
    try {
      console.log('[BAILEYS] 🧹 Cleaning up prior socket listeners...');
      sock.ev.removeAllListeners();
      sock.end();
    } catch (err) {
      console.warn('[BAILEYS] Cleanup warning:', err.message);
    }
    sock = null;
  }

  try {
    const { state, saveCreds, hasValidCreds, clearAuthState } = await useSupabaseAuthState(supabase, WHATSAPP_SESSION_ID);
    authHandle = { clearAuthState, saveCreds };
    hasPersistedCreds = hasValidCreds;

    const { version } = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger,
      browser: Browsers.ubuntu('Chrome'), // Standard Ubuntu Chrome tuple prevents 4-hour token invalidation
      keepAliveIntervalMs: 25000,         // Keep-alive ping every 25s prevents proxy/cloud idle drop
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: true,
      syncFullHistory: false,             // Fast lightweight connect without heavy sync
      generateHighQualityLinkPreview: false,
      fetchAgent: httpsAgent,
      customUploadHosts: [
        { hostname: 'mmg.whatsapp.net' },
        { hostname: 'mms.whatsapp.net' },
      ],
    });

    sock = newSock;
    console.log(`[BAILEYS] 🚀 Socket #${currentInstance} created. Awaiting handshake...`);

    newSock.ev.on('creds.update', async () => {
      if (currentInstance !== socketInstanceId) return;
      try {
        await saveCreds();
        hasPersistedCreds = true;
      } catch (err) {
        console.error('[BAILEYS] Creds update persistence error:', err.message);
      }
    });

    newSock.ev.on('connection.update', async (update) => {
      if (currentInstance !== socketInstanceId) {
        console.log(`[BAILEYS] 🛑 Ignoring event from obsolete socket generation #${currentInstance}`);
        return;
      }

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrCode = await QRCode.toDataURL(qr);
          isConnected = false;
          connectedUser = null;
          console.log(`[BAILEYS] 📱 QR Code generated for socket generation #${currentInstance}`);
          io.emit('qr', { qrCode: currentQrCode });
          io.emit('status', { status: 'qr_ready', connected: false, qrCode: currentQrCode });
        } catch (err) {
          console.error('[BAILEYS] Error generating QR code data URL:', err);
        }
      }

      if (connection === 'open') {
        isConnected = true;
        isConnecting = false;
        reconnectAttempts = 0;
        currentQrCode = null;
        lastConnectedAt = new Date().toISOString();
        connectedUser = newSock.user ? newSock.user.id.split(':')[0] : 'Go Grand Detailing';
        console.log(`[BAILEYS] ✅ Connection OPENED successfully! User: ${connectedUser} | Time: ${lastConnectedAt}`);
        io.emit('status', { status: 'connected', connected: true, user: connectedUser });
        processMessageQueue().catch((err) => console.warn('[QUEUE FLUSH ERROR]:', err.message));
      }

      if (connection === 'close') {
        isConnected = false;
        isConnecting = false;
        connectedUser = null;
        lastDisconnectAt = new Date().toISOString();

        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
        const closeReason = lastDisconnect?.error?.message || (typeof lastDisconnect?.error === 'string' ? lastDisconnect.error : 'Connection closed');
        lastDisconnectReason = String(closeReason);
        lastDisconnectCode = statusCode || null;

        const isExplicitLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isExplicitLoggedOut;

        // Diagnostic log without secrets
        console.log(`[BAILEYS] ⚠️ Connection CLOSED (Generation #${currentInstance}) | StatusCode: ${statusCode} | Reason: ${closeReason} | ShouldReconnect: ${shouldReconnect} | Time: ${lastDisconnectAt}`);

        if (isExplicitLoggedOut) {
          currentQrCode = null;
          console.log('[BAILEYS] 🚪 Logged out notification received from WhatsApp. Re-authentication required.');
          io.emit('status', { status: 'logged_out', connected: false });
          // Note: Do NOT automatically delete Supabase records; user can scan fresh QR to re-authenticate
        } else if (shouldReconnect) {
          reconnectAttempts++;
          // Exponential backoff: 3s, 5s, 8s, 12s, 18s, max 30s
          const backoffDelay = Math.min(30000, Math.round(3000 * Math.pow(1.5, Math.min(reconnectAttempts - 1, 5))));
          lastReconnectAt = new Date(Date.now() + backoffDelay).toISOString();

          console.log(`[BAILEYS] 🔄 Scheduling automatic reconnect in ${backoffDelay}ms (Attempt #${reconnectAttempts}) using persisted Supabase auth state...`);
          io.emit('status', { status: 'reconnecting', connected: false });

          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            console.log(`[BAILEYS] 🔄 Executing scheduled reconnect #${reconnectAttempts}...`);
            connectToWhatsApp();
          }, backoffDelay);
        }
      }
    });
  } catch (error) {
    console.error(`[BAILEYS] ❌ Failed initializing WhatsApp socket #${currentInstance}:`, error.message);
    isConnecting = false;
    isConnected = false;
    io.emit('status', { status: 'error', connected: false, error: error.message });

    reconnectAttempts++;
    const backoffDelay = Math.min(30000, Math.round(3000 * Math.pow(1.5, Math.min(reconnectAttempts - 1, 5))));
    lastReconnectAt = new Date(Date.now() + backoffDelay).toISOString();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToWhatsApp();
    }, backoffDelay);
  }
}

// REST API Endpoints

// Fast, ultra-lightweight health endpoint for external keep-alive monitoring (Render Free keep-alive)
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'go-grand-whatsapp',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/whatsapp/health', (req, res) => {
  const authDiag = getAuthStateDiagnostics();
  res.json({
    status: 'ok',
    service: 'go-grand-whatsapp-server',
    sessionPersistence: 'supabase',
    sessionId: WHATSAPP_SESSION_ID,
    whatsappConnected: isConnected,
    user: connectedUser,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    diagnostics: {
      whatsapp_connected: isConnected,
      whatsapp_authenticated: isConnected || (connectedUser !== null),
      has_persisted_creds: hasPersistedCreds,
      last_connected_at: lastConnectedAt,
      last_disconnect_at: lastDisconnectAt,
      last_disconnect_reason: lastDisconnectReason,
      last_disconnect_code: lastDisconnectCode,
      last_reconnect_at: lastReconnectAt,
      reconnect_attempts: reconnectAttempts,
      connection_generation: socketInstanceId,
      ...authDiag,
    },
  });
});

app.get('/api/whatsapp/status', (req, res) => {
  const authDiag = getAuthStateDiagnostics();
  res.json({
    connected: isConnected,
    user: connectedUser,
    qrCode: currentQrCode,
    isConnecting,
    sessionPersistence: 'supabase',
    diagnostics: {
      whatsapp_connected: isConnected,
      whatsapp_authenticated: isConnected || (connectedUser !== null),
      has_persisted_creds: hasPersistedCreds,
      last_connected_at: lastConnectedAt,
      last_disconnect_at: lastDisconnectAt,
      last_disconnect_reason: lastDisconnectReason,
      last_disconnect_code: lastDisconnectCode,
      last_reconnect_at: lastReconnectAt,
      reconnect_attempts: reconnectAttempts,
      connection_generation: socketInstanceId,
      ...authDiag,
      uptime: Math.floor(process.uptime()),
    },
  });
});

app.post('/api/whatsapp/connect', requireApiAuth, (req, res) => {
  if (!isConnected && !isConnecting) {
    console.log('📡 [/api/whatsapp/connect] Initiating connection...');
    connectToWhatsApp();
  } else {
    console.log(`📡 [/api/whatsapp/connect] Connection already active/in-progress (connected: ${isConnected}, isConnecting: ${isConnecting})`);
  }
  res.json({
    connected: isConnected,
    user: connectedUser,
    qrCode: currentQrCode,
    isConnecting,
    sessionPersistence: 'supabase',
  });
});

app.post('/api/whatsapp/logout', requireApiAuth, async (req, res) => {
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        await sock.logout().catch(() => {});
        sock.end();
      } catch (e) {}
      sock = null;
    }
    isConnected = false;
    isConnecting = false;
    connectedUser = null;
    currentQrCode = null;
    hasPersistedCreds = false;

    if (authHandle && authHandle.clearAuthState) {
      try {
        await authHandle.clearAuthState();
      } catch (authErr) {
        console.warn('[BAILEYS] Warning clearing Supabase auth state on manual logout:', authErr.message);
      }
    }

    io.emit('status', { status: 'logged_out', connected: false });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// 24/7 WHATSAPP OUTGOING MESSAGE QUEUE & IDEMPOTENCY ENGINE
// ==============================================================================
const messageQueue = [];
let isProcessingQueue = false;
const deliveredTriggers = new Set();

async function loadDeliveredTriggers() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'wa_delivered_triggers')
      .maybeSingle();

    if (!error && data && Array.isArray(data.value)) {
      data.value.forEach((k) => deliveredTriggers.add(k));
      console.log(`📋 [MESSAGE QUEUE] Loaded ${deliveredTriggers.size} delivered trigger records from Supabase.`);
    }
  } catch (err) {
    console.warn('[MESSAGE QUEUE] Warning loading delivered triggers:', err.message);
  }
}

async function markTriggerDelivered(idempotencyKey) {
  if (!idempotencyKey) return;
  deliveredTriggers.add(idempotencyKey);
  try {
    // Retain last 500 records to prevent database bloat
    const recentKeys = Array.from(deliveredTriggers).slice(-500);
    await supabase.from('app_settings').upsert({
      key: 'wa_delivered_triggers',
      value: recentKeys,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err) {
    console.warn('[MESSAGE QUEUE] Warning persisting delivered trigger key:', err.message);
  }
}

async function loadPendingQueue() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'wa_pending_queue')
      .maybeSingle();

    if (!error && data && Array.isArray(data.value)) {
      for (const item of data.value) {
        if (item.idempotencyKey && deliveredTriggers.has(item.idempotencyKey)) continue;
        if (!messageQueue.some((q) => q.id === item.id)) {
          messageQueue.push(item);
        }
      }
      console.log(`📋 [MESSAGE QUEUE] Restored ${messageQueue.length} pending queued items from Supabase.`);
    }
  } catch (err) {
    console.warn('[MESSAGE QUEUE] Warning loading pending queue from Supabase:', err.message);
  }
}

async function persistPendingQueue() {
  try {
    const serializableQueue = messageQueue.map((item) => ({
      id: item.id,
      type: item.type,
      job: item.job,
      phoneNumber: item.phoneNumber,
      textMessage: item.textMessage,
      idempotencyKey: item.idempotencyKey,
      createdAt: item.createdAt,
      attempts: item.attempts || 0,
      upiId: item.upiId,
    }));
    await supabase.from('app_settings').upsert({
      key: 'wa_pending_queue',
      value: serializableQueue,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err) {
    console.warn('[MESSAGE QUEUE] Warning saving pending queue to Supabase:', err.message);
  }
}

async function processMessageQueue() {
  if (isProcessingQueue) return;
  if (!isConnected || !sock) {
    if (!isConnecting && !reconnectTimer) {
      console.log('[MESSAGE QUEUE] Socket not connected. Initiating connection to process queue...');
      connectToWhatsApp();
    }
    return;
  }

  isProcessingQueue = true;

  try {
    while (messageQueue.length > 0 && isConnected && sock) {
      const item = messageQueue[0];

      if (item.idempotencyKey && deliveredTriggers.has(item.idempotencyKey)) {
        console.log(`ℹ️ [MESSAGE QUEUE] Item '${item.id}' already marked delivered. Skipping.`);
        messageQueue.shift();
        await persistPendingQueue();
        continue;
      }

      try {
        let cleanPhone = (item.phoneNumber || '').replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid);
        const targetJid = result && result.exists ? result.jid : jid;

        let sentMsg;
        if (item.type === 'pdf') {
          const pdfBuffer = item.pdfBuffer || (item.job ? await generateInvoicePDF(item.job) : null);
          const vehNo = (item.job?.vehicleNumber || 'Vehicle').toUpperCase();
          if (pdfBuffer) {
            sentMsg = await sock.sendMessage(targetJid, {
              document: pdfBuffer,
              mimetype: 'application/pdf',
              fileName: `Invoice_${vehNo}_GoGrand.pdf`,
              caption: item.textMessage,
            });
          } else {
            sentMsg = await sock.sendMessage(targetJid, { text: item.textMessage });
          }
        } else if (item.type === 'image_qr') {
          let qrBuffer = item.imageBuffer;
          if (!qrBuffer && item.upiId && item.job) {
            try {
              const priceStr = String(item.job.price || '0').replace(/[^0-9.]/g, '');
              const discountStr = String(item.job.discount || '0').replace(/[^0-9.]/g, '');
              const finalAmount = Math.max(0, (parseFloat(priceStr) || 0) - (parseFloat(discountStr) || 0)).toFixed(2);
              const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
              const vehNo = (item.job.vehicleNumber || 'Vehicle').toUpperCase().replace(/[^A-Z0-9]/g, '');
              const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);
              const upiUri = `upi://pay?pa=${item.upiId}&pn=${payeeName}&am=${finalAmount}&cu=INR&tn=${note}`;
              qrBuffer = await QRCode.toBuffer(upiUri, { type: 'png', width: 600, margin: 2 });
            } catch (e) {}
          }

          if (qrBuffer) {
            sentMsg = await sock.sendMessage(targetJid, {
              image: qrBuffer,
              caption: item.textMessage,
              mimetype: 'image/png',
            });
          } else {
            sentMsg = await sock.sendMessage(targetJid, { text: item.textMessage });
          }
        } else {
          sentMsg = await sock.sendMessage(targetJid, {
            text: item.textMessage,
          });
        }

        console.log(`✅ [MESSAGE QUEUE] Delivered ${item.type} trigger to ${cleanPhone} (MsgID: ${sentMsg?.key?.id})`);
        if (item.idempotencyKey) {
          await markTriggerDelivered(item.idempotencyKey);
        }
        messageQueue.shift();
        await persistPendingQueue();
      } catch (sendErr) {
        console.error(`❌ [MESSAGE QUEUE] Error delivering item ${item.id}:`, sendErr.message);
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= 3) {
          console.error(`❌ [MESSAGE QUEUE] Max retries reached for item ${item.id}. Dropping from queue.`);
          messageQueue.shift();
          await persistPendingQueue();
        } else {
          break;
        }
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

async function enqueueMessage(queueItem) {
  messageQueue.push(queueItem);
  await persistPendingQueue();
  processMessageQueue().catch((err) => console.warn('[QUEUE FLUSH ERROR]:', err.message));
  return queueItem;
}

app.get('/api/whatsapp/queue/status', (req, res) => {
  res.json({
    queueLength: messageQueue.length,
    deliveredCount: deliveredTriggers.size,
    isProcessing: isProcessingQueue,
    whatsappConnected: isConnected,
  });
});

app.post('/api/whatsapp/send-invoice', requireApiAuth, async (req, res) => {
  const { phoneNumber, message, idempotencyKey } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Phone number and message text are required.',
    });
  }

  if (idempotencyKey && deliveredTriggers.has(idempotencyKey)) {
    return res.json({ success: true, message: 'Already delivered', alreadyDelivered: true });
  }

  if (isConnected && sock) {
    try {
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
      const jid = `${cleanPhone}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);
      const targetJid = result && result.exists ? result.jid : jid;

      const sentMsg = await sock.sendMessage(targetJid, { text: message });
      if (idempotencyKey) await markTriggerDelivered(idempotencyKey);

      return res.json({
        success: true,
        messageId: sentMsg.key.id,
        recipient: cleanPhone,
      });
    } catch (error) {
      console.error('Direct send failed, enqueueing message:', error.message);
    }
  }

  // Enqueue for 24/7 resilient delivery
  const queueItem = {
    id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'text',
    phoneNumber,
    textMessage: message,
    idempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
  };
  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    message: 'Message queued for delivery',
    queueId: queueItem.id,
  });
});

app.post('/api/whatsapp/send-vehicle-ready-qr', requireApiAuth, async (req, res) => {
  const { job, phoneNumber, upiId, textMessage, idempotencyKey } = req.body;

  if (!job || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Job details and phone number are required.',
    });
  }

  const effectiveIdempotencyKey = idempotencyKey || (job?.id ? `ready_${job.id}` : null);
  if (effectiveIdempotencyKey && deliveredTriggers.has(effectiveIdempotencyKey)) {
    return res.json({ success: true, message: 'Vehicle Ready already delivered', alreadyDelivered: true });
  }

  let cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

  const priceStr = String(job.price || '0').replace(/[^0-9.]/g, '');
  const discountStr = String(job.discount || '0').replace(/[^0-9.]/g, '');
  const priceNum = parseFloat(priceStr) || 0;
  const discountNum = parseFloat(discountStr) || 0;
  const finalAmount = Math.max(0, priceNum - discountNum).toFixed(2);
  const targetUpiId = (upiId || '').trim();

  let qrPngBuffer = null;
  if (targetUpiId && parseFloat(finalAmount) > 0) {
    try {
      const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
      const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);
      const upiUri = `upi://pay?pa=${targetUpiId}&pn=${payeeName}&am=${finalAmount}&cu=INR&tn=${note}`;

      qrPngBuffer = await QRCode.toBuffer(upiUri, {
        type: 'png',
        width: 600,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (qrErr) {
      console.warn('UPI QR Buffer generation warning:', qrErr.message);
    }
  }

  if (isConnected && sock) {
    try {
      const jid = `${cleanPhone}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);
      const targetJid = result && result.exists ? result.jid : jid;

      let sentMsg;
      if (qrPngBuffer) {
        sentMsg = await sock.sendMessage(targetJid, {
          image: qrPngBuffer,
          caption: textMessage,
          mimetype: 'image/png',
        });
      } else {
        sentMsg = await sock.sendMessage(targetJid, { text: textMessage });
      }

      if (effectiveIdempotencyKey) await markTriggerDelivered(effectiveIdempotencyKey);

      return res.json({
        success: true,
        messageId: sentMsg.key.id,
        recipient: cleanPhone,
      });
    } catch (error) {
      console.error('Direct Vehicle Ready send failed, enqueueing:', error.message);
    }
  }

  // Enqueue for resilient delivery
  const queueItem = {
    id: `ready_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: qrPngBuffer ? 'image_qr' : 'text',
    job,
    phoneNumber: cleanPhone,
    upiId: targetUpiId,
    textMessage,
    imageBuffer: qrPngBuffer,
    idempotencyKey: effectiveIdempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
  };
  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    message: 'Vehicle Ready notification queued for delivery',
    queueId: queueItem.id,
  });
});

app.get('/api/whatsapp/invoice-pdf', async (req, res) => {
  try {
    const jobData = {
      id: req.query.id || Date.now().toString(),
      vehicleNumber: req.query.vehicleNumber || 'VEHICLE',
      vehicleName: req.query.vehicleName || 'Standard Car',
      customerName: req.query.customerName || 'Valued Customer',
      phoneNumber: req.query.phoneNumber || '',
      price: req.query.price || '0',
      services: req.query.services ? req.query.services.split(',') : ['Car Wash & Detailing'],
      createdAt: req.query.createdAt || new Date().toISOString(),
    };

    const pdfBuffer = await generateInvoicePDF(jobData);
    const vehNo = (jobData.vehicleNumber || 'Vehicle').toUpperCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice_${vehNo}_GoGrand.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error serving PDF invoice:', error);
    res.status(500).send('Error generating PDF invoice');
  }
});

app.post('/api/whatsapp/send-invoice-pdf', requireApiAuth, async (req, res) => {
  const { job, phoneNumber, textMessage, idempotencyKey } = req.body;

  if (!job || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Job details and phone number are required.',
    });
  }

  const effectiveIdempotencyKey = idempotencyKey || (job?.id ? `bill_${job.id}` : null);
  if (effectiveIdempotencyKey && deliveredTriggers.has(effectiveIdempotencyKey)) {
    return res.json({ success: true, message: 'Invoice already sent', alreadyDelivered: true });
  }

  let cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

  let pdfBuffer = null;
  try {
    pdfBuffer = await generateInvoicePDF(job);
  } catch (pdfErr) {
    console.warn('PDF generation fallback:', pdfErr.message);
  }

  if (isConnected && sock && pdfBuffer) {
    try {
      const jid = `${cleanPhone}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);
      const targetJid = result && result.exists ? result.jid : jid;

      const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase();
      const fileName = `Invoice_${vehNo}_GoGrand.pdf`;

      const sentDoc = await sock.sendMessage(targetJid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName,
        caption: textMessage,
      });

      if (effectiveIdempotencyKey) await markTriggerDelivered(effectiveIdempotencyKey);

      return res.json({
        success: true,
        messageId: sentDoc.key.id,
        recipient: cleanPhone,
        fileName: fileName,
      });
    } catch (sendErr) {
      console.error('Direct PDF invoice send failed, enqueueing:', sendErr.message);
    }
  }

  // Enqueue for 24/7 resilient delivery
  const queueItem = {
    id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'pdf',
    job,
    pdfBuffer,
    phoneNumber: cleanPhone,
    textMessage,
    idempotencyKey: effectiveIdempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
  };
  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    message: 'Invoice PDF queued for delivery',
    queueId: queueItem.id,
  });
});

// Dedicated Trigger Endpoints for Automatic Actions
app.post('/api/whatsapp/trigger/vehicle-received', requireApiAuth, async (req, res) => {
  const { job, phoneNumber, textMessage, idempotencyKey } = req.body;
  const triggerKey = idempotencyKey || (job?.id ? `recv_${job.id}` : null);

  if (triggerKey && deliveredTriggers.has(triggerKey)) {
    return res.json({ success: true, message: 'Vehicle Received trigger already sent', alreadyDelivered: true });
  }

  const queueItem = {
    id: `trig_recv_${Date.now()}`,
    type: 'text',
    job,
    phoneNumber,
    textMessage,
    idempotencyKey: triggerKey,
    createdAt: Date.now(),
    attempts: 0,
  };

  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    trigger: 'VEHICLE_RECEIVED',
    queueId: queueItem.id,
  });
});

app.post('/api/whatsapp/trigger/vehicle-ready', requireApiAuth, async (req, res) => {
  const { job, phoneNumber, upiId, textMessage, idempotencyKey } = req.body;
  const triggerKey = idempotencyKey || (job?.id ? `ready_${job.id}` : null);

  if (triggerKey && deliveredTriggers.has(triggerKey)) {
    return res.json({ success: true, message: 'Vehicle Ready trigger already sent', alreadyDelivered: true });
  }

  let qrPngBuffer = null;
  const targetUpiId = (upiId || '').trim();
  const priceNum = parseFloat(String(job?.price || '0').replace(/[^0-9.]/g, '')) || 0;
  const discountNum = parseFloat(String(job?.discount || '0').replace(/[^0-9.]/g, '')) || 0;
  const finalAmount = Math.max(0, priceNum - discountNum).toFixed(2);

  if (targetUpiId && parseFloat(finalAmount) > 0) {
    try {
      const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
      const vehNo = (job?.vehicleNumber || 'Vehicle').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);
      const upiUri = `upi://pay?pa=${targetUpiId}&pn=${payeeName}&am=${finalAmount}&cu=INR&tn=${note}`;
      qrPngBuffer = await QRCode.toBuffer(upiUri, { type: 'png', width: 600, margin: 2 });
    } catch (e) {}
  }

  const queueItem = {
    id: `trig_ready_${Date.now()}`,
    type: qrPngBuffer ? 'image_qr' : 'text',
    job,
    phoneNumber,
    upiId: targetUpiId,
    textMessage,
    imageBuffer: qrPngBuffer,
    idempotencyKey: triggerKey,
    createdAt: Date.now(),
    attempts: 0,
  };

  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    trigger: 'VEHICLE_READY',
    queueId: queueItem.id,
  });
});

app.post('/api/whatsapp/trigger/whatsapp-bill', requireApiAuth, async (req, res) => {
  const { job, phoneNumber, textMessage, idempotencyKey } = req.body;
  const triggerKey = idempotencyKey || (job?.id ? `bill_${job.id}` : null);

  if (triggerKey && deliveredTriggers.has(triggerKey)) {
    return res.json({ success: true, message: 'WhatsApp Bill already sent', alreadyDelivered: true });
  }

  let pdfBuffer = null;
  try {
    pdfBuffer = await generateInvoicePDF(job);
  } catch (e) {}

  const queueItem = {
    id: `trig_bill_${Date.now()}`,
    type: 'pdf',
    job,
    pdfBuffer,
    phoneNumber,
    textMessage,
    idempotencyKey: triggerKey,
    createdAt: Date.now(),
    attempts: 0,
  };

  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    trigger: 'WHATSAPP_BILL',
    queueId: queueItem.id,
  });
});

// ==============================================================================
// DATABASE USAGE MONITORING & AUTOMATIC BACKUP ENDPOINTS (OWNER ONLY)
// ==============================================================================

function requireOwnerAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-owner-token'];
  const clientRole = req.headers['x-user-role'];

  // Reject staff profiles explicitly
  if (clientRole && clientRole !== 'OWNER') {
    return res.status(403).json({ success: false, error: 'Forbidden: Owner authorization required for database operations.' });
  }

  if (API_SECRET) {
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (token === API_SECRET) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized: Owner authorization required.' });
  }

  next();
}

app.get('/api/database/usage', requireOwnerAuth, async (req, res) => {
  const metrics = await getDatabaseUsageMetrics(supabase);
  res.json(metrics);
});

app.post('/api/database/backup', requireOwnerAuth, async (req, res) => {
  console.log('📡 [/api/database/backup] Manual database backup requested by Owner.');
  const backupResult = await createDatabaseBackup(supabase);
  res.json(backupResult);
});

app.get('/api/database/backups', requireOwnerAuth, (req, res) => {
  const backups = listBackups();
  res.json({
    success: true,
    count: backups.length,
    backups,
    summary: getBackupSummary(),
  });
});

io.on('connection', (socket) => {
  socket.emit('status', {
    status: isConnected ? 'connected' : (currentQrCode ? 'qr_ready' : 'connecting'),
    connected: isConnected,
    user: connectedUser,
    qrCode: currentQrCode,
  });

  socket.on('request_qr', () => {
    if (!isConnected && !isConnecting) {
      connectToWhatsApp();
    }
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Go Grand WhatsApp Server running on port ${PORT} (0.0.0.0:${PORT})`);
  await loadDeliveredTriggers();
  await loadPendingQueue();
  connectToWhatsApp();
  initBackupScheduler(supabase);
});
