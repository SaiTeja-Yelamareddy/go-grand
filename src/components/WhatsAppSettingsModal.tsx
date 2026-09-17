import React, { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw, LogOut, Send, Smartphone, AlertCircle, X, Server, Globe } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getWhatsAppBackendUrl } from '../config/apiConfig';

interface WhatsAppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDisplayPhone = (rawNumber?: string | null) => {
  if (!rawNumber) return 'WhatsApp Owner';
  const clean = rawNumber.replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return `+${clean}`;
};

export const WhatsAppSettingsModal: React.FC<WhatsAppSettingsModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting' | 'error'>('connecting');
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [serverOnline, setServerOnline] = useState<boolean>(false);
  const [testPhone, setTestPhone] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('Hello from Go Grand Car Wash! 🚗');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Custom Cloud Backend URL Configuration
  const [customBackendUrl, setCustomBackendUrl] = useState<string>('');
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [urlSaveSuccess, setUrlSaveSuccess] = useState<boolean>(false);

  const activeBackendUrl = getWhatsAppBackendUrl();

  const fetchStatus = async () => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      console.log(`[WHATSAPP HEALTH] GET ${activeBackendUrl}/api/whatsapp/status`);
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/status`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setServerOnline(true);
        if (data.connected) {
          setStatus('connected');
          setConnectedUser(data.user);
        } else if (data.qrCode) {
          setStatus('qr_ready');
          setQrCode(data.qrCode);
        } else if (data.isConnecting) {
          setStatus('connecting');
        } else {
          setStatus('connecting');
        }
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      console.warn('[WHATSAPP HEALTH] Check failed or timed out:', err);
      setServerOnline(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualConnect = async () => {
    setIsLoading(true);
    try {
      console.log(`[WHATSAPP HEALTH] POST ${activeBackendUrl}/api/whatsapp/connect`);
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/connect`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setServerOnline(true);
        if (data.connected) {
          setStatus('connected');
          setConnectedUser(data.user);
        } else if (data.qrCode) {
          setStatus('qr_ready');
          setQrCode(data.qrCode);
        }
      }
    } catch {
      setServerOnline(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Sanitize any legacy stored value
    const stored = localStorage.getItem('go-grand-whatsapp-server-url') || '';
    if (stored === 'https://go-grand-whatsapp.onrender.com' || stored === 'http://localhost:5000') {
      localStorage.removeItem('go-grand-whatsapp-server-url');
      setCustomBackendUrl('');
    } else {
      setCustomBackendUrl(stored);
    }

    let socket: Socket | null = null;

    fetchStatus();

    try {
      console.log(`[WHATSAPP SOCKET] Connecting to ${activeBackendUrl}`);
      socket = io(activeBackendUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 12000,
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        console.log('[WHATSAPP SOCKET] Connected');
        setServerOnline(true);
        socket?.emit('request_qr');
      });

      socket.on('disconnect', () => {
        console.log('[WHATSAPP SOCKET] Disconnected');
      });

      socket.on('qr', (data: { qrCode: string }) => {
        setQrCode(data.qrCode);
        setStatus('qr_ready');
        setIsLoading(false);
        setServerOnline(true);
      });

      socket.on('status', (data: { status: any; connected: boolean; user?: string; qrCode?: string }) => {
        setServerOnline(true);
        if (data.connected) {
          setStatus('connected');
          setConnectedUser(data.user || 'Linked Owner Account');
          setQrCode(null);
        } else if (data.qrCode) {
          setStatus('qr_ready');
          setQrCode(data.qrCode);
        } else if (data.status) {
          setStatus(data.status);
        }
        setIsLoading(false);
      });
    } catch {
      setServerOnline(false);
    }

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('qr');
        socket.off('status');
        socket.disconnect();
      }
    };
  }, [isOpen, activeBackendUrl]);

  const handleSaveCustomServer = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customBackendUrl.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem('go-grand-whatsapp-server-url', clean);
    } else {
      localStorage.removeItem('go-grand-whatsapp-server-url');
    }
    setUrlSaveSuccess(true);
    setTimeout(() => {
      setUrlSaveSuccess(false);
      window.location.reload();
    }, 1200);
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to unlink your WhatsApp account?')) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/logout`, { method: 'POST' });
      if (res.ok) {
        setStatus('connecting');
        setConnectedUser(null);
        setQrCode(null);
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !testMessage) return;

    setSendingTest(true);
    setTestFeedback(null);

    try {
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: testPhone,
          message: testMessage,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestFeedback({
          type: 'success',
          message: `Test message delivered successfully to +91 ${testPhone.replace(/\D/g, '')}!`,
        });
        setTestPhone('');
      } else {
        setTestFeedback({
          type: 'error',
          message: data.error || 'Failed to deliver message via WhatsApp backend.',
        });
      }
    } catch (err: any) {
      setTestFeedback({
        type: 'error',
        message: err.message || 'WhatsApp Server is unreachable.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-[#0A0A0A] rounded-3xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl overflow-hidden text-left animate-fade-in max-h-[90vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-[#1F1F1F] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white uppercase tracking-wider">
                WhatsApp Linked Device
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Multi-Device Engine (Baileys)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Server Status Pill */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center space-x-2">
              <span className={`w-2.5 h-2.5 rounded-full ${serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>Backend Engine Status:</span>
            </span>
            <div className="flex items-center space-x-2">
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
                serverOnline
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
              }`}>
                {serverOnline ? 'Online' : 'Server Offline'}
              </span>
              <button
                onClick={fetchStatus}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Refresh Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Server Offline Warning */}
          {!serverOnline && !isLoading && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>WhatsApp Cloud Backend Offline</span>
              </div>
              <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-400">
                The persistent Node.js WhatsApp engine is currently unreachable at:
                <br />
                <code className="text-[11px] font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800 inline-block mt-1">
                  {activeBackendUrl}
                </code>
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setShowServerConfig(!showServerConfig)}
                  className="px-3 py-1.5 bg-rose-200/60 dark:bg-rose-900/40 hover:bg-rose-200 text-rose-900 dark:text-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>Configure Cloud Server URL</span>
                </button>
                <button
                  onClick={handleManualConnect}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {/* Cloud Server URL Configuration Box */}
          {showServerConfig && (
            <div className="p-4 bg-[#F7F7F7] dark:bg-slate-800/80 rounded-2xl border border-slate-300 dark:border-slate-700 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Cloud Backend URL</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowServerConfig(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Enter your deployed Node.js WhatsApp backend URL (e.g. from Render, Railway, or VPS):
              </p>
              <form onSubmit={handleSaveCustomServer} className="flex gap-2">
                <input
                  type="url"
                  value={customBackendUrl}
                  onChange={(e) => setCustomBackendUrl(e.target.value)}
                  placeholder="https://go-grand.onrender.com"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono placeholder:font-sans focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#111111] hover:bg-neutral-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-black font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  Save URL
                </button>
              </form>
              {urlSaveSuccess && (
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800/60">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Backend URL updated! Reconnecting...</span>
                </div>
              )}
            </div>
          )}

          {/* Connected State View */}
          {status === 'connected' && (
            <div className="p-5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Device Linked & Active</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Unlink Phone</span>
                </button>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-950 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Linked Account</p>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {formatDisplayPhone(connectedUser)}
                  </p>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                  Ready to Dispatch
                </span>
              </div>
            </div>
          )}

          {/* QR Code / Pairing State */}
          {status !== 'connected' && serverOnline && (
            <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex flex-col items-center justify-center text-center space-y-4">
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                  Link WhatsApp via QR Code
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Open WhatsApp on your mobile → Linked Devices → Link a Device
                </p>
              </div>

              {qrCode ? (
                <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-200">
                  <img src={qrCode} alt="WhatsApp Pairing QR Code" className="w-56 h-56 object-contain" />
                </div>
              ) : (
                <div className="py-8 space-y-3 flex flex-col items-center text-slate-500 dark:text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                  <p className="text-xs font-medium">Generating encrypted WhatsApp QR code...</p>
                </div>
              )}
            </div>
          )}

          {/* Connected State - Test Message Sender */}
          {status === 'connected' && (
            <div className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Send Test Invoice Message
              </h4>
              <form onSubmit={handleSendTestMessage} className="space-y-3">
                <div>
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Recipient Mobile Number (e.g. 9876543210)"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows={2}
                    placeholder="Test message text"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingTest || !testPhone}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-2"
                >
                  {sendingTest ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send WhatsApp Test Alert</span>
                    </>
                  )}
                </button>
              </form>

              {testFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in ${
                    testFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {testFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  )}
                  <span>{testFeedback.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Cloud Server Settings</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
