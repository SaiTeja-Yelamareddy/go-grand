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
} from '@whiskeysockets/baileys';
import { useSupabaseAuthState } from './supabaseAuth.js';

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
let authHandle = null;

const logger = pino({ level: 'debug' });
const httpsAgent = new https.Agent({ keepAlive: true });

async function connectToWhatsApp(force = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (isConnected && !force) {
    console.log(`[BAILEYS] ℹ️ Already connected as ${connectedUser}. Skipping duplicate connection.`);
    return;
  }

  if (isConnecting && !force) {
    console.log('[BAILEYS] ⏳ Connection already in progress. Skipping duplicate connect call.');
    return;
  }

  isConnecting = true;
  const currentInstance = ++socketInstanceId;
  console.log(`[BAILEYS] 🔌 Initializing WhatsApp Baileys socket (Instance #${currentInstance})...`);
  io.emit('status', { status: 'connecting', connected: false });

  // If previous socket exists, safely remove listeners and close
  if (sock) {
    try {
      console.log('[BAILEYS] 🧹 Cleaning up previous socket listeners...');
      sock.ev.removeAllListeners();
      sock.end();
    } catch (err) {
      console.warn('[BAILEYS] Warning cleaning old socket:', err.message);
    }
    sock = null;
  }

  try {
    const { state, saveCreds, clearAuthState } = await useSupabaseAuthState(supabase, WHATSAPP_SESSION_ID);
    authHandle = { clearAuthState, saveCreds };

    const { version } = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger,
      browser: ['Go Grand Car Wash', 'Chrome', '1.0.0'],
      fetchAgent: httpsAgent,
      customUploadHosts: [
        { hostname: 'mmg.whatsapp.net' },
        { hostname: 'mms.whatsapp.net' },
      ],
    });

    sock = newSock;
    console.log(`[BAILEYS] 🚀 Socket #${currentInstance} created successfully.`);

    newSock.ev.on('creds.update', async () => {
      if (currentInstance !== socketInstanceId) return;
      try {
        await saveCreds();
      } catch (err) {
        console.warn('[BAILEYS] Creds update warning:', err.message);
      }
    });

    newSock.ev.on('connection.update', async (update) => {
      if (currentInstance !== socketInstanceId) {
        console.log(`[BAILEYS] 🛑 Ignoring event from obsolete socket #${currentInstance}`);
        return;
      }

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrCode = await QRCode.toDataURL(qr);
          isConnected = false;
          connectedUser = null;
          console.log(`[BAILEYS] 📱 QR Code generated for socket #${currentInstance}`);
          io.emit('qr', { qrCode: currentQrCode });
          io.emit('status', { status: 'qr_ready', connected: false, qrCode: currentQrCode });
        } catch (err) {
          console.error('[BAILEYS] Error generating QR code data URL:', err);
        }
      }

      if (connection === 'open') {
        isConnected = true;
        isConnecting = false;
        currentQrCode = null;
        connectedUser = newSock.user ? newSock.user.id.split(':')[0] : 'Go Grand Owner';
        console.log(`[BAILEYS] ✅ Connection OPENED successfully! Connected user: ${connectedUser}`);
        io.emit('status', { status: 'connected', connected: true, user: connectedUser });
      }

      if (connection === 'close') {
        isConnected = false;
        isConnecting = false;
        connectedUser = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const closeReason = lastDisconnect?.error?.message || lastDisconnect?.error || 'Unknown error';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isLoggedOut;

        console.log(`[BAILEYS] ⚠️ Connection CLOSED for socket #${currentInstance}. StatusCode: ${statusCode}, Reason: ${closeReason}, ShouldReconnect: ${shouldReconnect}`);

        if (isLoggedOut) {
          currentQrCode = null;
          console.log('[BAILEYS] 🚪 Logged out. Clearing Supabase authentication session records.');
          if (authHandle && authHandle.clearAuthState) {
            try {
              await authHandle.clearAuthState();
            } catch (authErr) {
              console.warn('[BAILEYS] Error clearing auth state on logout:', authErr.message);
            }
          }
          io.emit('status', { status: 'logged_out', connected: false });
        } else if (shouldReconnect) {
          io.emit('status', { status: 'reconnecting', connected: false });
          console.log('[BAILEYS] 🔄 Scheduling reconnect in 5000ms...');
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            console.log('[BAILEYS] 🔄 Executing scheduled reconnect...');
            connectToWhatsApp();
          }, 5000);
        }
      }
    });
  } catch (error) {
    console.error(`[BAILEYS] ❌ Failed to initialize WhatsApp connection #${currentInstance}:`, error);
    isConnecting = false;
    isConnected = false;
    io.emit('status', { status: 'error', connected: false, error: error.message });
  }
}

// REST API Endpoints

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'go-grand-whatsapp-server',
    sessionPersistence: 'supabase',
    sessionId: WHATSAPP_SESSION_ID,
    whatsappConnected: isConnected,
    user: connectedUser,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/whatsapp/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'go-grand-whatsapp-server',
    sessionPersistence: 'supabase',
    sessionId: WHATSAPP_SESSION_ID,
    whatsappConnected: isConnected,
    user: connectedUser,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    connected: isConnected,
    user: connectedUser,
    qrCode: currentQrCode,
    isConnecting,
    sessionPersistence: 'supabase',
  });
});

app.post('/api/whatsapp/connect', requireApiAuth, (req, res) => {
  if (!isConnected && !isConnecting) {
    console.log('📡 [/api/whatsapp/connect] Initiating connection...');
    connectToWhatsApp();
  } else {
    console.log(`📡 [/api/whatsapp/connect] Connection already active (connected: ${isConnected}, isConnecting: ${isConnecting})`);
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

    if (authHandle && authHandle.clearAuthState) {
      try {
        await authHandle.clearAuthState();
      } catch (authErr) {
        console.warn('[BAILEYS] Warning clearing Supabase auth state on logout:', authErr.message);
      }
    }

    io.emit('status', { status: 'logged_out', connected: false });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/send-invoice', requireApiAuth, async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.',
    });
  }

  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and message text are required.',
      });
    }

    // Clean phone number (strip all non-digits)
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    // Check if user exists on WhatsApp
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);

    const targetJid = result && result.exists ? result.jid : jid;

    // Send WhatsApp text message
    const sentMsg = await sock.sendMessage(targetJid, { text: message });

    res.json({
      success: true,
      messageId: sentMsg.key.id,
      recipient: cleanPhone,
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send WhatsApp message',
    });
  }
});

app.post('/api/whatsapp/send-vehicle-ready-qr', requireApiAuth, async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code in Settings first.',
    });
  }

  try {
    const { job, phoneNumber, upiId, textMessage } = req.body;

    if (!job || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Job details and phone number are required.',
      });
    }

    // Clean phone number
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);
    const targetJid = result && result.exists ? result.jid : jid;

    // Calculate exact invoice price
    const priceStr = String(job.price || '0').replace(/[^0-9.]/g, '');
    const discountStr = String(job.discount || '0').replace(/[^0-9.]/g, '');
    const priceNum = parseFloat(priceStr) || 0;
    const discountNum = parseFloat(discountStr) || 0;
    const finalAmount = Math.max(0, priceNum - discountNum).toFixed(2);

    let sentMsg;
    const targetUpiId = (upiId || '').trim();

    if (targetUpiId && parseFloat(finalAmount) > 0) {
      // Build NPCI-compliant UPI deep-link URI with clean Payee Name (no ampersand)
      const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
      const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);
      const upiUri = `upi://pay?pa=${targetUpiId}&pn=${payeeName}&am=${finalAmount}&cu=INR&tn=${note}`;

      console.log(`💳 [UPI QR GENERATION] Payee: GO GRAND Car Wash and Detailing | Amount: ₹${finalAmount} | Vehicle: ${vehNo}`);

      // Generate High Quality PNG Buffer of QR Code
      const qrPngBuffer = await QRCode.toBuffer(upiUri, {
        type: 'png',
        width: 600,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      console.log(`📱 [WHATSAPP DISPATCH] Sending Vehicle Ready QR Image to ${cleanPhone}...`);

      sentMsg = await sock.sendMessage(targetJid, {
        image: qrPngBuffer,
        caption: textMessage,
        mimetype: 'image/png',
      });
    } else {
      console.log(`📱 [WHATSAPP DISPATCH] Sending Vehicle Ready text message to ${cleanPhone}...`);
      sentMsg = await sock.sendMessage(targetJid, {
        text: textMessage,
      });
    }

    res.json({
      success: true,
      messageId: sentMsg.key.id,
      recipient: cleanPhone,
    });
  } catch (error) {
    console.error('❌ Error sending Vehicle Ready UPI QR:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send Vehicle Ready UPI QR',
    });
  }
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
  if (!isConnected || !sock) {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp is not connected. Please scan the QR code first.',
    });
  }

  try {
    const { job, phoneNumber, textMessage } = req.body;

    if (!job || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Job details and phone number are required.',
      });
    }

    // Clean phone number
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);
    const targetJid = result && result.exists ? result.jid : jid;

    // Generate Vector PDF Document Buffer
    console.log(`📄 Generating PDF Tax Invoice for vehicle ${job.vehicleNumber}...`);
    const pdfBuffer = await generateInvoicePDF(job);
    
    // PDF Buffer Verification
    const isBuffer = Buffer.isBuffer(pdfBuffer);
    const bufLen = pdfBuffer ? pdfBuffer.length : 0;
    const header = isBuffer && bufLen >= 5 ? pdfBuffer.slice(0, 5).toString('utf-8') : 'INVALID';

    console.log(`🔍 [PDF VERIFICATION] IsBuffer: ${isBuffer} | Length: ${bufLen} bytes | Header: "${header}"`);
    if (header !== '%PDF-') {
      console.error('❌ [PDF VERIFICATION FAILED] Buffer does not start with %PDF-!');
    } else {
      console.log('✅ [PDF VERIFICATION PASSED] Valid PDF header detected.');
    }

    // Inspect Baileys WhatsApp Session & Media Connection
    try {
      console.log('🌐 [BAILEYS MEDIA CONN] Inspecting media upload hosts...');
      const mediaConn = await sock.refreshMediaConn(true);
      console.log('🌐 [BAILEYS MEDIA CONN] Hosts count:', mediaConn.hosts ? mediaConn.hosts.length : 0);
      console.log('🌐 [BAILEYS MEDIA CONN] Hosts list:', mediaConn.hosts ? mediaConn.hosts.map(h => h.hostname) : []);
    } catch (connErr) {
      console.warn('⚠️ [BAILEYS MEDIA CONN WARNING] Could not refresh media conn:', connErr.message);
    }

    const vehNo = (job.vehicleNumber || 'Vehicle').toUpperCase();
    const fileName = `Invoice_${vehNo}_GoGrand.pdf`;

    console.log(`📎 Dispatching native WhatsApp PDF document attachment for vehicle ${vehNo}...`);

    let sentDoc;
    try {
      sentDoc = await sock.sendMessage(targetJid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName,
        caption: textMessage,
      });

      console.log(`✅ Native WhatsApp PDF Document sent to ${cleanPhone}! Message ID: ${sentDoc.key.id}`);

      res.json({
        success: true,
        messageId: sentDoc.key.id,
        recipient: cleanPhone,
        fileName: fileName,
      });
    } catch (sendErr) {
      console.error('❌ [BAILEYS SEND ERROR DETAILED]:');
      console.error('Error message:', sendErr.message);
      console.error('Error name:', sendErr.name);
      console.error('Error isBoom:', sendErr.isBoom);
      if (sendErr.output) {
        console.error('Boom Output:', JSON.stringify(sendErr.output, null, 2));
      }
      if (sendErr.data) {
        console.error('Boom Underlying Data / Cause:', sendErr.data);
      }
      if (sendErr.cause) {
        console.error('Error Cause:', sendErr.cause);
      }
      if (sendErr.stack) {
        console.error('Stack Trace:', sendErr.stack);
      }
      throw sendErr;
    }
  } catch (error) {
    console.error('❌ Error generating or sending PDF invoice:', error);
    if (error.response) {
      console.error('Axios Response Status:', error.response.status);
      console.error('Axios Response Data:', error.response.data);
    }
    if (error.cause) {
      console.error('Error Cause:', error.cause);
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate and send PDF invoice',
    });
  }
});

app.post('/api/whatsapp/test-pdf', requireApiAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    let cleanPhone = (phoneNumber || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);
    const targetJid = result && result.exists ? result.jid : jid;

    const testPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 R<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 R<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
    );

    console.log(`🧪 [TEST MINIMAL PDF] IsBuffer: ${Buffer.isBuffer(testPdfBuffer)} | Len: ${testPdfBuffer.length} | Header: "${testPdfBuffer.slice(0, 5).toString('utf-8')}"`);

    const sentDoc = await sock.sendMessage(targetJid, {
      document: testPdfBuffer,
      mimetype: 'application/pdf',
      fileName: 'test.pdf',
      caption: '🧪 Test minimal PDF document attachment',
    });

    res.json({ success: true, messageId: sentDoc.key.id, recipient: cleanPhone });
  } catch (err) {
    console.error('❌ [TEST MINIMAL PDF ERROR DETAILED]:', err);
    res.status(500).json({ success: false, error: err.message, data: err.data });
  }
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Go Grand WhatsApp Server running on port ${PORT} (0.0.0.0:${PORT})`);
  connectToWhatsApp();
});
