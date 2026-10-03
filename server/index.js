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
import { Mutex } from 'async-mutex';
import { generateInvoicePDF } from './pdfGenerator.js';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  proto,
  BufferJSON,
  generateWAMessageContent,
  areJidsSameUser,
  jidDecode,
} from '@whiskeysockets/baileys';
import NodeCache from '@cacheable/node-cache';
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

// Mutex to synchronize WhatsApp connection initialization and prevent simultaneous socket generation
const connectionInitMutex = new Mutex();

// Module-level persistent retry counter cache (survives socket reconnections)
const rawRetryCache = new NodeCache({
  stdTTL: 3600, // 1 hour TTL
  useClones: false,
});

const msgRetryCounterCache = {
  get: (key) => {
    const val = rawRetryCache.get(key);
    if (val !== undefined) {
      console.log(`[RETRY CACHE] 🔍 GET ${key} => Count: ${val}`);
    }
    return val;
  },
  set: (key, val) => {
    console.log(`[RETRY CACHE] 📝 SET ${key} => Count: ${val}`);
    return rawRetryCache.set(key, val);
  },
  del: (key) => {
    console.log(`[RETRY CACHE] 🗑️ DEL ${key}`);
    return rawRetryCache.del(key);
  },
  flushAll: () => {
    console.log(`[RETRY CACHE] 🧹 flushAll called`);
    return rawRetryCache.flushAll();
  },
};

// In-flight retry resend tracker for deduplication
const inflightRetryResends = new Set();

// Safe diagnostic logger for Baileys: captures retry & crypto logs without credentials/keys
const logger = pino({
  level: process.env.BAILEYS_LOG_LEVEL || 'debug',
  hooks: {
    logMethod(inputArgs, method) {
      const firstArg = inputArgs[0];
      // Never log private cryptographic credentials or noise keys
      if (typeof firstArg === 'object' && firstArg !== null) {
        if (firstArg.noiseKey || firstArg.signedIdentityKey || firstArg.signedPreKey || firstArg.creds) {
          return;
        }
      }

      // Filter and log only relevant protocol events (retries, decryption, sessions, errors)
      const text = typeof firstArg === 'string'
        ? firstArg
        : (firstArg?.msg || JSON.stringify(firstArg || {}));

      if (
        text.includes('retry') ||
        text.includes('session') ||
        text.includes('decrypt') ||
        text.includes('receipt') ||
        text.includes('error') ||
        text.includes('fail') ||
        text.includes('ack')
      ) {
        return method.apply(this, inputArgs);
      }
    },
  },
});
const httpsAgent = new https.Agent({ keepAlive: true });

// IST Date & Time Formatters (Asia/Kolkata timezone: 03 October 2026, 07:25 PM)
function formatMessageDateIST(dateInput) {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(validDate);
  } catch {
    return '03 October 2026';
  }
}

function formatMessageTimeIST(dateInput) {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .format(validDate)
      .replace(/\u202f|\u00a0/g, ' ')
      .toUpperCase();
  } catch {
    return '07:25 PM';
  }
}

// ==============================================================================
// WHATSAPP MESSAGE RETRY / ENCRYPTION RECOVERY ENGINE (E2EE RETRY & getMessage)
// Resolves "Waiting for this message. This may take a while. Check your phone."
// ==============================================================================
const sentMessagesStore = new Map();
let saveSentMessagesDebounceTimer = null;

async function loadSentMessagesStore() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'wa_sent_messages_recovery')
      .maybeSingle();

    if (!error && data && Array.isArray(data.value)) {
      data.value.forEach((item) => {
        if (item && item.messageId) {
          let revivedProto = item.protoMessage;
          if (revivedProto) {
            try {
              revivedProto = JSON.parse(JSON.stringify(revivedProto), BufferJSON.reviver);
            } catch (e) {}
          }
          sentMessagesStore.set(item.messageId, {
            ...item,
            protoMessage: revivedProto,
          });
        }
      });
      console.log(`📋 [MESSAGE RECOVERY] Loaded ${sentMessagesStore.size} recent sent message recovery records from Supabase.`);
    }
  } catch (err) {
    console.warn('[MESSAGE RECOVERY] Warning loading recovery store:', err.message);
  }
}

async function persistSentMessagesStore() {
  try {
    // Retain last 250 records to prevent database bloat while providing ample retry window
    const recentRecords = Array.from(sentMessagesStore.values()).slice(-250).map((rec) => {
      let safeProto = null;
      if (rec.protoMessage) {
        try {
          safeProto = JSON.parse(JSON.stringify(rec.protoMessage, BufferJSON.replacer));
        } catch (e) {
          safeProto = null;
        }
      }
      return {
        ...rec,
        protoMessage: safeProto,
      };
    });

    await supabase.from('app_settings').upsert(
      {
        key: 'wa_sent_messages_recovery',
        value: recentRecords,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  } catch (err) {
    console.warn('[MESSAGE RECOVERY] Warning persisting recovery store:', err.message);
  }
}

async function lookupMessageInSupabase(msgId) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'wa_sent_messages_recovery')
      .maybeSingle();

    if (!error && data && Array.isArray(data.value)) {
      const found = data.value.find((item) => item.messageId === msgId);
      if (found) {
        let revivedProto = found.protoMessage;
        if (revivedProto) {
          try {
            revivedProto = JSON.parse(JSON.stringify(revivedProto), BufferJSON.reviver);
          } catch (e) {}
        }
        const record = { ...found, protoMessage: revivedProto };
        sentMessagesStore.set(msgId, record);
        return record;
      }
    }
  } catch (e) {
    console.warn('[BAILEYS RETRY] Warning looking up message in Supabase:', e.message);
  }
  return null;
}

function recordSentMessage(entry) {
  if (!entry || !entry.messageId) return;

  const originalKey = entry.key || {
    id: entry.messageId,
    remoteJid: entry.remoteJid,
    fromMe: true,
    participant: entry.participant || undefined,
  };

  const record = {
    messageId: entry.messageId,
    remoteJid: entry.remoteJid,
    key: {
      id: originalKey.id,
      remoteJid: originalKey.remoteJid,
      fromMe: typeof originalKey.fromMe === 'boolean' ? originalKey.fromMe : true,
      participant: originalKey.participant || undefined,
    },
    type: entry.type || 'text',
    textMessage: entry.textMessage || '',
    jobId: entry.jobId || entry.job?.id || null,
    jobData: entry.job ? {
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
    } : (entry.jobData || null),
    upiId: entry.upiId || null,
    protoMessage: entry.protoMessage || null, // Live object retained in memory for zero-loss instant retry
    timestamp: Date.now(),
  };

  sentMessagesStore.set(entry.messageId, record);

  // Evict older entries if size exceeds 300
  if (sentMessagesStore.size > 300) {
    const oldestKey = sentMessagesStore.keys().next().value;
    sentMessagesStore.delete(oldestKey);
  }

  // Debounce saving to Supabase to prevent spamming on rapid sends
  if (saveSentMessagesDebounceTimer) {
    clearTimeout(saveSentMessagesDebounceTimer);
  }
  saveSentMessagesDebounceTimer = setTimeout(() => {
    persistSentMessagesStore().catch((err) => console.warn('[MESSAGE RECOVERY] Persist warning:', err.message));
  }, 1000);
}

async function getMessageForRetry(key) {
  const msgId = key?.id;
  if (!msgId) return undefined;

  let entry = sentMessagesStore.get(msgId);
  if (!entry) {
    entry = await lookupMessageInSupabase(msgId);
  }

  if (!entry) {
    console.warn(`[BAILEYS RETRY] ⚠️ Message ID '${msgId}' not found in recovery store.`);
    return undefined; // Must return undefined, never empty object {}
  }

  console.log(`[BAILEYS RETRY] 🔄 Reconstructing message for ID '${msgId}' (Type: ${entry.type}, Target: ${entry.remoteJid || key.remoteJid})...`);

  // 1. If protoMessage was cached, reconstruct directly
  if (entry.protoMessage) {
    try {
      const msgObj = proto.Message.fromObject(entry.protoMessage);
      console.log(`[BAILEYS RETRY] ✅ Successfully reconstructed protoMessage from cache for ${msgId}`);
      return msgObj;
    } catch (protoErr) {
      console.warn('[BAILEYS RETRY] Failed reconstructing protoMessage, falling back to dynamic generator:', protoErr.message);
    }
  }

  // 2. Dynamic reconstruction based on message type (NO PDF BINARY PERSISTED)
  if (entry.type === 'pdf') {
    let job = entry.jobData;
    if (!job && entry.jobId) {
      try {
        const { data } = await supabase.from('jobs').select('*').eq('id', entry.jobId).maybeSingle();
        if (data) {
          job = {
            id: data.id,
            vehicleNumber: data.vehicle_number,
            customerName: data.customer_name,
            phoneNumber: data.phone_number,
            vehicleName: data.vehicle_name,
            price: data.price,
            discount: data.discount,
            services: data.services,
            billNo: data.bill_no,
            createdAt: data.created_at,
          };
        }
      } catch (dbErr) {
        console.warn('[BAILEYS RETRY] Error querying job from Supabase:', dbErr.message);
      }
    }

    if (job) {
      console.log(`[BAILEYS RETRY] 📄 Regenerating invoice PDF dynamically for job ${job.vehicleNumber}...`);
      const pdfBuffer = await generateInvoicePDF(job);
      const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase();
      if (sock && sock.waUploadToServer) {
        const generated = await generateWAMessageContent(
          {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: `Invoice_${vehNo}_GoGrand.pdf`,
            caption: entry.textMessage,
          },
          { upload: sock.waUploadToServer }
        );
        return proto.Message.fromObject(generated);
      }
    }

    return proto.Message.fromObject({
      extendedTextMessage: { text: entry.textMessage || 'Your GO GRAND Invoice is ready.' },
    });
  }

  if (entry.type === 'image_qr') {
    if (entry.jobData && entry.upiId) {
      try {
        const priceStr = String(entry.jobData.price || '0').replace(/[^0-9.]/g, '');
        const discountStr = String(entry.jobData.discount || '0').replace(/[^0-9.]/g, '');
        const finalAmount = Math.max(0, (parseFloat(priceStr) || 0) - (parseFloat(discountStr) || 0)).toFixed(2);
        const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
        const vehNo = (entry.jobData.vehicleNumber || 'Vehicle').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);
        const upiUri = `upi://pay?pa=${entry.upiId}&pn=${payeeName}&am=${finalAmount}&cu=INR&tn=${note}`;
        const qrBuffer = await QRCode.toBuffer(upiUri, { type: 'png', width: 600, margin: 2 });
        if (sock && sock.waUploadToServer) {
          const generated = await generateWAMessageContent(
            { image: qrBuffer, caption: entry.textMessage, mimetype: 'image/png' },
            { upload: sock.waUploadToServer }
          );
          return proto.Message.fromObject(generated);
        }
      } catch (qrErr) {
        console.warn('[BAILEYS RETRY] QR reconstruction warning:', qrErr.message);
      }
    }

    return proto.Message.fromObject({
      extendedTextMessage: { text: entry.textMessage || 'Your vehicle is ready for pickup at GO GRAND.' },
    });
  }

  // Text message reconstruction
  return proto.Message.fromObject({
    extendedTextMessage: { text: entry.textMessage || '' },
  });
}

function scheduleReconnect(reason = 'temporary connection failure') {
  if (reconnectTimer || isConnected) return;

  reconnectAttempts++;
  const backoffDelay = Math.min(30000, Math.round(3000 * Math.pow(1.5, Math.min(reconnectAttempts - 1, 5))));
  lastReconnectAt = new Date(Date.now() + backoffDelay).toISOString();
  console.log(`[BAILEYS] 🔄 Scheduling automatic reconnect in ${backoffDelay}ms (Attempt #${reconnectAttempts}; ${reason}) using persisted Supabase auth state...`);
  io.emit('status', { status: 'reconnecting', connected: false });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    console.log(`[BAILEYS] 🔄 Executing scheduled reconnect #${reconnectAttempts}...`);
    connectToWhatsApp().catch((err) => console.error('[BAILEYS] Reconnect initialization failed:', err.message));
  }, backoffDelay);
}

let cachedBaileysVersion = null;
let lastVersionFetchTime = 0;

async function getCachedBaileysVersion() {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (cachedBaileysVersion && (Date.now() - lastVersionFetchTime < ONE_DAY)) {
    return cachedBaileysVersion;
  }
  try {
    const versionPromise = fetchLatestBaileysVersion();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
    const { version } = await Promise.race([versionPromise, timeoutPromise]);
    cachedBaileysVersion = version;
    lastVersionFetchTime = Date.now();
    return version;
  } catch (err) {
    if (cachedBaileysVersion) return cachedBaileysVersion;
    return [2, 3000, 1015901307];
  }
}

async function connectToWhatsApp(force = false) {
  // If not forcing and another connection initialization is currently holding the mutex,
  // return immediately to prevent stacking duplicate socket initialization attempts
  if (connectionInitMutex.isLocked() && !force) {
    console.log('[BAILEYS] ⏳ WhatsApp connection initialization is already running under mutex. Reusing active initialization.');
    return;
  }

  return connectionInitMutex.runExclusive(() => connectToWhatsAppUnlocked(force));
}

async function connectToWhatsAppUnlocked(force = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (isConnected && !force) {
    console.log(`[BAILEYS] ℹ️ Already connected as ${connectedUser}. Reusing existing socket.`);
    return;
  }

  if (force) {
    isConnecting = false;
  } else if (isConnecting) {
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
    const { state, saveCreds, hasValidCreds, clearAuthState, getDiagnostics } = await useSupabaseAuthState(supabase, WHATSAPP_SESSION_ID);
    authHandle = { clearAuthState, saveCreds, getDiagnostics };
    hasPersistedCreds = hasValidCreds;

    const version = await getCachedBaileysVersion();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger,
      msgRetryCounterCache,
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
      getMessage: async (key) => {
        const msgId = key?.id;
        if (!msgId) return undefined;
        let entry = null;
        try {
          console.log(`[BAILEYS NATIVE RETRY] 🔍 getMessage called by native Baileys:
  Key ID: ${key?.id}
  Key RemoteJID: ${key?.remoteJid}
  Key fromMe: ${key?.fromMe}
  Key Participant: ${key?.participant || 'none'}
  Socket state: isOpen=${Boolean(sock && sock.ws && sock.ws.isOpen)}`);

          const memEntry = sentMessagesStore.get(msgId);
          entry = memEntry;
          const foundInMemory = Boolean(memEntry);
          if (!entry) {
            entry = await lookupMessageInSupabase(msgId);
          }
          const foundInSupabase = Boolean(!foundInMemory && entry);
          const foundSource = foundInMemory ? 'memory' : (foundInSupabase ? 'supabase' : 'none');

          console.log(`[BAILEYS NATIVE RETRY] 📦 Message lookup result for ${msgId}:
  Found: ${Boolean(entry)} (source: ${foundSource})
  Type: ${entry?.type || 'unknown'}
  Has ProtoMessage: ${Boolean(entry?.protoMessage)}
  Socket state: isOpen=${Boolean(sock && sock.ws && sock.ws.isOpen)}`);

          if (!entry) {
            console.warn(`[BAILEYS RETRY] ⚠️ Message ID '${msgId}' not found in recovery store.`);
            return undefined;
          }

          // Mark retry in-progress so Layer-2 watchdog cooperates and yields to native Baileys
          entry._retryInProgress = true;

          const participant = key.participant || key.remoteJid || (entry ? entry.remoteJid : 'unknown');
          const remoteJid = key.remoteJid || (entry ? entry.remoteJid : 'unknown');
          const retryCount = (msgRetryCounterCache.get(`${msgId}:${participant}`) || 0) + 1;

          console.log(`[BAILEYS RETRY]
Message ID: ${msgId}
Remote JID: ${remoteJid}
Participant: ${participant}
Retry count: ${retryCount}
Message found: true
Message type: ${entry.type}
Session assertion: DELEGATED_TO_NATIVE_BAILEYS
Re-encryption: IN_PROGRESS
Resend: NATIVE_BAILEYS_IN_PROGRESS
Result: PENDING_NATIVE_RELAY`);

          const msg = await getMessageForRetry(key);
          if (msg) {
            entry._retryHandled = Date.now();
            console.log(`[BAILEYS RETRY]
Message ID: ${msgId}
Remote JID: ${remoteJid}
Participant: ${participant}
Retry count: ${retryCount}
Message found: true
Message type: ${entry.type}
Session assertion: DELEGATED_TO_NATIVE_BAILEYS
Re-encryption: SUCCESS
Resend: NATIVE_BAILEYS_SUCCESS
Result: RESOLVED`);
            return msg;
          }

          return undefined;
        } catch (retryErr) {
          const errMsg = retryErr?.message || String(retryErr || 'Unknown error');
          console.error(`[BAILEYS RETRY] ❌ Error in getMessage handler for ${key?.id}:`, errMsg);
          return undefined;
        } finally {
          if (entry) {
            entry._retryInProgress = false;
          }
        }
      },
    });

    sock = newSock;

    // Wrap socket native retry methods with detailed safe diagnostics
    const origAssertSessions = newSock.assertSessions;
    newSock.assertSessions = async (jids, force) => {
      const safeJids = (jids || []).map((j) => String(j || ''));
      console.log(`[BAILEYS NATIVE RETRY] 🔑 assertSessions started for: ${safeJids.join(', ')} (force: ${force}) | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
      const startTime = Date.now();
      try {
        const res = await origAssertSessions.call(newSock, jids, force);
        console.log(`[BAILEYS NATIVE RETRY] ✅ assertSessions completed for: ${safeJids.join(', ')} in ${Date.now() - startTime}ms (didFetchNewSession: ${res}) | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
        return res;
      } catch (err) {
        console.error(`[BAILEYS NATIVE RETRY] ❌ assertSessions failed for: ${safeJids.join(', ')} in ${Date.now() - startTime}ms:`, err?.message || err);
        throw err;
      }
    };

    const origRelayMessage = newSock.relayMessage;
    newSock.relayMessage = async (jid, message, opts) => {
      const msgId = opts?.messageId || 'unknown';
      const participantJid = opts?.participant?.jid || 'none';
      const retryCount = opts?.participant?.count || 'none';
      console.log(`[BAILEYS NATIVE RETRY] 📤 relayMessage started for MsgID: ${msgId} to ${jid} (participant: ${participantJid}, retryCount: ${retryCount}, useUserDevicesCache: ${opts?.useUserDevicesCache}) | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
      const startTime = Date.now();
      try {
        const res = await origRelayMessage.call(newSock, jid, message, opts);
        console.log(`[BAILEYS NATIVE RETRY] ✅ relayMessage completed for MsgID: ${msgId} to ${jid} in ${Date.now() - startTime}ms | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
        return res;
      } catch (err) {
        console.error(`[BAILEYS NATIVE RETRY] ❌ relayMessage failed for MsgID: ${msgId} to ${jid} in ${Date.now() - startTime}ms:`, err?.message || err);
        throw err;
      }
    };

    const origSendNode = newSock.sendNode;
    newSock.sendNode = async (node) => {
      const isAck = node?.tag === 'ack';
      if (isAck) {
        const ackAttrs = node?.attrs || {};
        console.log(`[BAILEYS NATIVE RETRY] 📨 Retry ACK attempted for ID: ${ackAttrs.id} (to: ${ackAttrs.to}, class: ${ackAttrs.class}, type: ${ackAttrs.type}, recipient: ${ackAttrs.recipient || 'none'}) | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
      }
      try {
        const res = await origSendNode.call(newSock, node);
        if (isAck) {
          console.log(`[BAILEYS NATIVE RETRY] ✅ Retry ACK completed for ID: ${node?.attrs?.id} | Socket isOpen: ${Boolean(newSock.ws && newSock.ws.isOpen)}`);
        }
        return res;
      } catch (err) {
        if (isAck) {
          console.error(`[BAILEYS NATIVE RETRY] ❌ Retry ACK failed for ID: ${node?.attrs?.id}:`, err?.message || err);
        }
        throw err;
      }
    };

    console.log(`[BAILEYS] 🚀 Socket #${currentInstance} created. Awaiting handshake...`);

    newSock.ev.on('creds.update', async () => {
      if (currentInstance !== socketInstanceId) return;
      console.log('[WA] credentials update received');
      try {
        await saveCreds();
        hasPersistedCreds = true;
        console.log('[WA] credentials persisted successfully');
      } catch (err) {
        console.error('[WA] credentials persistence failed:', err.message);
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
          currentQrCode = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          isConnected = false;
          isConnecting = false;
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
          scheduleReconnect(`socket closed with status ${statusCode || 'unknown'}`);
        }
      }
    });

    // ==============================================================================
    // RETRY RECEIPT INTERCEPTOR & DUAL-LAYER RESCUE ENGINE
    // Layer 1: Synchronously fixes Baileys 6.7.24 fromMe=false bug so native sendMessagesAgain runs
    // Layer 2: Async watchdog rescue resend with exact sendToAll multi-device fan-out
    // Ensures "Waiting for this message" is immediately decrypted and resolved!
    // ==============================================================================

    // Layer 1: Prepend synchronous hook to fix Baileys handleReceipt fromMe calculation & log safe receipt diagnostics
    newSock.ws.prependListener('CB:receipt', (node) => {
      if (currentInstance !== socketInstanceId) return;
      const { attrs, content } = node || {};
      if (attrs?.type === 'retry') {
        const msgId = attrs.id;
        const from = attrs.from;
        const participant = attrs.participant || 'none';
        const recipient = attrs.recipient || 'none';
        const type = attrs.type;
        const retryNode = Array.isArray(content) ? content.find((c) => c?.tag === 'retry') : null;
        const retryCount = retryNode?.attrs?.count || '1';
        const timestampT = attrs.t || retryNode?.attrs?.t || 'unknown';

        const isLid = (attrs.from || '').includes('lid');
        const myJid = isLid ? newSock.authState?.creds?.me?.lid : newSock.authState?.creds?.me?.id;
        const isNodeFromMe = areJidsSameUser(attrs.participant || attrs.from, myJid);
        const rawFromMe = !attrs.recipient || ((attrs.type === 'retry' || attrs.type === 'sender') && isNodeFromMe);

        console.log(`[BAILEYS NATIVE RETRY] 📥 Retry receipt stanza received:
  ID: ${msgId}
  From: ${from}
  Participant: ${participant}
  Recipient: ${recipient}
  Type: ${type}
  Retry count: ${retryCount}
  Timestamp (t): ${timestampT}
  IsNodeFromMe: ${isNodeFromMe}
  Raw fromMe (unpatched): ${rawFromMe}
  Patched fromMe: true
  Socket state: isOpen=${Boolean(newSock.ws && newSock.ws.isOpen)}`);

        if (attrs.recipient) {
          // Any incoming retry receipt arriving at our socket is for a message WE originally sent.
          // In Baileys 6.7.24 (messages-recv.js line 505), `fromMe = !attrs.recipient || ...` evaluates to false
          // whenever `attrs.recipient` is present, causing Baileys to log "recv retry for not fromMe message" and abort!
          // We define a smart getter on attrs.recipient so line 505 reads undefined (evaluating fromMe to true),
          // while subsequent reads (such as sendMessageAck on line 50) return the original recipient for the ACK stanza.
          const origRecipient = attrs.recipient;
          let accessCount = 0;
          Object.defineProperty(attrs, 'recipient', {
            get() {
              accessCount++;
              return accessCount === 1 ? undefined : origRecipient;
            },
            configurable: true,
            enumerable: true,
          });
        }
      }
    });

    // Helper to verify socket is open and actively connected
    const isSocketActive = () => Boolean(newSock && newSock.ws && newSock.ws.isOpen && !newSock.ws.isClosed);

    // Layer-2 rescue resend temporarily disabled to isolate native Baileys 6.7.24 retry flow
    const ENABLE_LAYER_2_RESCUE_RESEND = false;

    // Layer 2: Watchdog & Rescue Resend Interceptor (Cooperative Fallback - Temporarily Disabled)
    newSock.ws.on('CB:receipt', async (node) => {
      if (currentInstance !== socketInstanceId) return;
      let msgId = null;
      try {
        const { attrs, content } = node || {};
        if (attrs?.type !== 'retry') return;

        msgId = attrs.id;
        const remoteJid = attrs.from;
        const participant = attrs.participant || remoteJid;
        const retryNode = Array.isArray(content) ? content.find((c) => c?.tag === 'retry') : null;
        const retryCount = parseInt(retryNode?.attrs?.count || '1', 10);

        if (!msgId) return;

        // Deduplication: Lock at the message ID level so concurrent stanzas (or device fan-outs)
        // cannot trigger multiple simultaneous rescue operations for the same message.
        if (inflightRetryResends.has(msgId)) {
          return;
        }
        inflightRetryResends.add(msgId);
        setTimeout(() => inflightRetryResends.delete(msgId), 10000);

        if (!ENABLE_LAYER_2_RESCUE_RESEND) {
          console.log(`[BAILEYS RETRY] ℹ️ Layer-2 rescue resend is temporarily disabled to isolate native Baileys retry flow. Bypassing rescue for ${msgId}.`);
          return;
        }

        // Pre-check: if socket is already closed or shutting down, exit cleanly without attempting sends
        if (!isSocketActive() || currentInstance !== socketInstanceId) {
          console.log(`[BAILEYS RETRY] ℹ️ Socket #${currentInstance} is closed/inactive. Bypassing rescue for ${msgId} to allow clean reconnect.`);
          return;
        }

        // Allow Baileys native sendMessagesAgain a cooperative window (1200ms) to execute via getMessage
        await new Promise((r) => setTimeout(r, 1200));

        // Re-check socket health immediately after wait window: if socket closed in interim, exit cleanly!
        if (!isSocketActive() || currentInstance !== socketInstanceId) {
          console.log(`[BAILEYS RETRY] ℹ️ Socket #${currentInstance} closed during wait window. Aborting rescue for ${msgId} to allow clean reconnect.`);
          return;
        }

        let entry = sentMessagesStore.get(msgId);
        if (!entry) {
          entry = await lookupMessageInSupabase(msgId);
        }

        if (!entry) {
          console.warn(`[BAILEYS RETRY]
Message ID: ${msgId}
Remote JID: ${remoteJid}
Participant: ${participant}
Retry count: ${retryCount}
Message found: false
Message type: unknown
Session assertion: SKIPPED
Re-encryption: SKIPPED
Resend: FAILED
Result: NOT_FOUND_IN_STORE`);
          return;
        }

        // If native Baileys sendMessagesAgain is in-progress or recently re-sent the message, skip duplicate rescue!
        if (entry._retryInProgress || (entry._retryHandled && (Date.now() - entry._retryHandled < 10000))) {
          return;
        }

        // Final socket health check before starting rescue session assertion and relay
        if (!isSocketActive() || currentInstance !== socketInstanceId) {
          console.log(`[BAILEYS RETRY] ℹ️ Socket #${currentInstance} closed before rescue resend. Aborting for ${msgId}.`);
          return;
        }

        // Execute Layer 2 Rescue Resend
        console.warn(`[BAILEYS RETRY] 🚨 Baileys native retry did not execute for ${msgId}. Executing Layer 2 rescue recovery...`);

        let sessionAsserted = false;
        try {
          if (isSocketActive()) {
            await newSock.assertSessions([participant], true);
            sessionAsserted = true;
          }
        } catch (sessErr) {
          if (!isSocketActive()) {
            console.log(`[BAILEYS RETRY] ℹ️ Session assertion for ${msgId} aborted because socket closed.`);
            return;
          }
          console.warn(`[BAILEYS RETRY] Rescue session assertion warning: ${sessErr?.message || sessErr}`);
        }

        if (!isSocketActive() || currentInstance !== socketInstanceId) {
          console.log(`[BAILEYS RETRY] ℹ️ Socket closed during session assertion. Aborting rescue for ${msgId}.`);
          return;
        }

        const reconstructedMsg = await getMessageForRetry({
          id: msgId,
          remoteJid: entry.remoteJid || remoteJid,
          fromMe: true,
          participant,
        });

        if (!reconstructedMsg) {
          console.error(`[BAILEYS RETRY]
Message ID: ${msgId}
Remote JID: ${entry.remoteJid || remoteJid}
Participant: ${participant}
Retry count: ${retryCount}
Message found: true
Message type: ${entry.type}
Session assertion: ${sessionAsserted ? 'SUCCESS' : 'FAILED'}
Re-encryption: FAILED
Resend: FAILED
Result: RECONSTRUCTION_FAILED`);
          return;
        }

        if (!isSocketActive() || currentInstance !== socketInstanceId) {
          console.log(`[BAILEYS RETRY] ℹ️ Socket closed before relayMessage. Aborting rescue for ${msgId}.`);
          return;
        }

        // Determine relay options using exact Baileys sendToAll multi-device fan-out logic
        const sendToAll = !jidDecode(participant)?.device;
        const msgRelayOpts = { messageId: msgId };
        if (sendToAll) {
          msgRelayOpts.useUserDevicesCache = false;
        } else {
          msgRelayOpts.participant = {
            jid: participant,
            count: retryCount,
          };
        }

        const targetDestination = entry.remoteJid || remoteJid;
        await newSock.relayMessage(targetDestination, reconstructedMsg, msgRelayOpts);
        msgRetryCounterCache.set(`${msgId}:${participant}`, retryCount);
        entry._retryHandled = Date.now();

        console.log(`[BAILEYS RETRY]
Message ID: ${msgId}
Remote JID: ${targetDestination}
Participant: ${participant}
Retry count: ${retryCount}
Message found: true
Message type: ${entry.type}
Session assertion: ${sessionAsserted ? 'SUCCESS' : 'FAILED'}
Re-encryption: SUCCESS
Resend: RESCUE_SUCCESS
Result: RESOLVED`);
      } catch (interceptErr) {
        const errText = interceptErr?.stack || interceptErr?.message || (typeof interceptErr === 'object' ? JSON.stringify(interceptErr) : String(interceptErr || 'Unknown error'));
        if (String(errText).includes('Connection Closed') || String(errText).includes('428')) {
          console.warn(`[BAILEYS RETRY] ℹ️ Rescue for ${msgId || 'unknown'} cleanly aborted: connection closed (${errText.split('\n')[0]})`);
        } else {
          console.error(`[BAILEYS RETRY RECEIPT] ❌ Error in rescue handler for ${msgId || 'unknown'}:`, errText);
        }
      }
    });
  } catch (error) {
    console.error(`[BAILEYS] ❌ Failed initializing WhatsApp socket #${currentInstance}:`, error.message);
    isConnecting = false;
    isConnected = false;
    io.emit('status', { status: 'error', connected: false, error: error.message });
    scheduleReconnect('socket initialization failed');
  }
}

// REST API Endpoints

// Fast, ultra-lightweight health endpoint for external keep-alive monitoring (Render Free keep-alive)
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'go-grand-whatsapp',
    whatsapp: {
      socket: isConnected ? 'open' : (isConnecting ? 'connecting' : 'closed'),
      authenticated: Boolean(isConnected && connectedUser),
      reconnecting: Boolean(reconnectTimer),
      lastConnectedAt,
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/whatsapp/health', async (req, res) => {
  const authDiag = getAuthStateDiagnostics();
  const persistedAuthDiag = authHandle?.getDiagnostics ? await authHandle.getDiagnostics().catch((error) => ({ diagnostic_error: error.message })) : null;
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
      persisted_auth: persistedAuthDiag,
    },
  });
});

app.get('/api/whatsapp/status', async (req, res) => {
  const includeDiagnostics = req.query.diagnostics === 'true';
  const authDiag = getAuthStateDiagnostics();
  let persistedAuthDiag = null;
  if (includeDiagnostics && authHandle?.getDiagnostics) {
    persistedAuthDiag = await authHandle.getDiagnostics().catch((error) => ({ diagnostic_error: error.message }));
  }
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
      persisted_auth: persistedAuthDiag,
      uptime: Math.floor(process.uptime()),
    },
  });
});

app.get('/api/whatsapp/diagnostics/retries', requireApiAuth, (req, res) => {
  res.json({
    success: true,
    sentMessagesStoreSize: sentMessagesStore.size,
    recentMessages: Array.from(sentMessagesStore.values()).slice(-10).map((m) => ({
      messageId: m.messageId,
      remoteJid: m.remoteJid,
      type: m.type,
      timestamp: new Date(m.timestamp).toISOString(),
      hasProtoMessage: Boolean(m.protoMessage),
    })),
    connected: isConnected,
    connectedUser,
    inflightRetryCount: inflightRetryResends.size,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/whatsapp/connect', requireApiAuth, (req, res) => {
  const force = Boolean(req.body?.force);
  if (!isConnected && (!isConnecting || force)) {
    console.log(`📡 [/api/whatsapp/connect] Initiating connection (force: ${force})...`);
    connectToWhatsApp(force);
  } else {
    console.log(`📡 [/api/whatsapp/connect] Connection already active/in-progress (connected: ${isConnected}, isConnecting: ${isConnecting})`);
  }

  // If a QR code is already available in memory, broadcast it to all clients immediately
  if (currentQrCode) {
    io.emit('qr', { qrCode: currentQrCode });
    io.emit('status', { status: 'qr_ready', connected: false, qrCode: currentQrCode });
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

    io.emit('status', { status: 'connecting', connected: false });
    res.json({ success: true, message: 'Logged out successfully' });

    // CRITICAL: Immediately generate a fresh QR code for linking the new phone without delay
    setTimeout(() => {
      console.log('🔄 [BAILEYS] Automatically generating new QR code after unlink...');
      connectToWhatsApp(true).catch((err) => {
        console.error('[BAILEYS] Error generating post-unlink QR:', err.message);
      });
    }, 150);
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
        const targetJid = `${cleanPhone}@s.whatsapp.net`;

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
        if (sentMsg?.key?.id) {
          recordSentMessage({
            messageId: sentMsg.key.id,
            remoteJid: targetJid,
            key: sentMsg.key,
            type: item.type,
            textMessage: item.textMessage,
            job: item.job,
            upiId: item.upiId,
            protoMessage: sentMsg.message,
          });
        }
        if (item.idempotencyKey) {
          await markTriggerDelivered(item.idempotencyKey);
        }
        messageQueue.shift();
        await persistPendingQueue();
      } catch (sendErr) {
        console.error(`❌ [MESSAGE QUEUE] Error delivering item ${item.id}:`, sendErr.message);
        item.attempts = (item.attempts || 0) + 1;
        messageQueue.shift();
        if (item.attempts >= 3) {
          console.error(`❌ [MESSAGE QUEUE] Max retries reached for item ${item.id}. Dropping from queue.`);
        } else {
          messageQueue.push(item);
        }
        await persistPendingQueue();
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
      const targetJid = `${cleanPhone}@s.whatsapp.net`;

      const sentMsg = await sock.sendMessage(targetJid, { text: message });
      if (idempotencyKey) await markTriggerDelivered(idempotencyKey);

      recordSentMessage({
        messageId: sentMsg.key.id,
        remoteJid: targetJid,
        key: sentMsg.key,
        type: 'text',
        textMessage: message,
        protoMessage: sentMsg.message,
      });

      return res.json({
        success: true,
        messageId: sentMsg.key.id,
        recipient: cleanPhone,
      });
    } catch (error) {
      console.error('Direct send failed:', error.message);
      return res.status(400).json({ success: false, error: 'WhatsApp could not send the message. Make sure the number is valid and on WhatsApp.' });
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
      const targetJid = `${cleanPhone}@s.whatsapp.net`;

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

      recordSentMessage({
        messageId: sentMsg.key.id,
        remoteJid: targetJid,
        key: sentMsg.key,
        type: qrPngBuffer ? 'image_qr' : 'text',
        textMessage: textMessage,
        job: job,
        upiId: targetUpiId,
        protoMessage: sentMsg.message,
      });

      return res.json({
        success: true,
        messageId: sentMsg.key.id,
        recipient: cleanPhone,
      });
    } catch (error) {
      console.error('Direct Vehicle Ready send failed:', error.message);
      return res.status(400).json({ success: false, error: 'WhatsApp could not send the message. Make sure the number is valid and on WhatsApp.' });
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
      const targetJid = `${cleanPhone}@s.whatsapp.net`;

      const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase();
      const fileName = `Invoice_${vehNo}_GoGrand.pdf`;

      const sentDoc = await sock.sendMessage(targetJid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName,
        caption: textMessage,
      });

      if (effectiveIdempotencyKey) await markTriggerDelivered(effectiveIdempotencyKey);

      recordSentMessage({
        messageId: sentDoc.key.id,
        remoteJid: targetJid,
        key: sentDoc.key,
        type: 'pdf',
        textMessage: textMessage,
        job: job,
        protoMessage: sentDoc.message,
      });

      return res.json({
        success: true,
        messageId: sentDoc.key.id,
        recipient: cleanPhone,
        fileName: fileName,
      });
    } catch (sendErr) {
      console.error('Direct PDF invoice send failed:', sendErr.message);
      return res.status(400).json({ success: false, error: 'WhatsApp could not send the message. Make sure the number is valid and on WhatsApp.' });
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

app.post('/api/whatsapp/send-promotional', requireApiAuth, async (req, res) => {
  const { phoneNumber, message, customerName, vehicleNumber, jobId, idempotencyKey } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Phone number and message text are required.',
    });
  }

  if (idempotencyKey && deliveredTriggers.has(idempotencyKey)) {
    return res.json({ success: true, message: 'Promotional message already delivered', alreadyDelivered: true });
  }

  let cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  if (isConnected && sock) {
    try {
      const sentMsg = await sock.sendMessage(targetJid, { text: message });
      if (idempotencyKey) await markTriggerDelivered(idempotencyKey);

      recordSentMessage({
        messageId: sentMsg.key.id,
        remoteJid: targetJid,
        key: sentMsg.key,
        type: 'text',
        textMessage: message,
        jobId: jobId || null,
        protoMessage: sentMsg.message,
      });

      console.log(`✅ [PROMOTIONAL] Sent promotional message to ${cleanPhone} (MsgID: ${sentMsg?.key?.id})`);

      return res.json({
        success: true,
        messageId: sentMsg.key.id,
        recipient: cleanPhone,
      });
    } catch (error) {
      console.error('Direct promotional send failed:', error.message);
      return res.status(400).json({ success: false, error: 'WhatsApp could not send promotional message. Make sure the number is valid and on WhatsApp.' });
    }
  }

  // Enqueue for resilient delivery if temporarily reconnecting
  const queueItem = {
    id: `promo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'text',
    phoneNumber: cleanPhone,
    textMessage: message,
    idempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
  };
  await enqueueMessage(queueItem);

  res.json({
    success: true,
    queued: true,
    message: 'Promotional message queued for delivery',
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

function requireStrictOwnerAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-owner-token'];
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  if (req.headers['x-user-role'] === 'OWNER' || (API_SECRET && token === API_SECRET)) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Forbidden: Owner authorization required.' });
}

app.get('/api/whatsapp/diagnostic', requireStrictOwnerAuth, async (req, res) => {
  try {
    const persistedAuth = authHandle?.getDiagnostics
      ? await authHandle.getDiagnostics()
      : { session_exists: false, diagnostic_state: 'not_initialized' };
    res.json({
      success: true,
      backend_online: true,
      session_id: WHATSAPP_SESSION_ID,
      session_persistence: 'supabase',
      persisted_auth: persistedAuth,
      socket: {
        state: isConnected ? 'open' : (isConnecting ? 'connecting' : (reconnectTimer ? 'reconnecting' : 'closed')),
        authenticated: Boolean(isConnected && connectedUser),
        last_connected_at: lastConnectedAt,
      },
    });
  } catch (error) {
    console.error('[WA] Safe diagnostic failed:', error.message);
    res.status(503).json({
      success: false,
      backend_online: true,
      session_persistence: 'supabase',
      error: 'WhatsApp persistence diagnostic unavailable',
    });
  }
});

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

  if (currentQrCode) {
    socket.emit('qr', { qrCode: currentQrCode });
  }

  socket.on('request_qr', () => {
    if (currentQrCode) {
      socket.emit('qr', { qrCode: currentQrCode });
      socket.emit('status', { status: 'qr_ready', connected: false, qrCode: currentQrCode });
    } else if (!isConnected && !isConnecting) {
      console.log('📡 [SOCKET] request_qr received, starting connection...');
      connectToWhatsApp(true);
    }
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Go Grand WhatsApp Server running on port ${PORT} (0.0.0.0:${PORT})`);
  await loadDeliveredTriggers();
  await loadPendingQueue();
  await loadSentMessagesStore();
  connectToWhatsApp();
  initBackupScheduler(supabase);
});
