import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getWhatsAppBackendUrl } from '../config/apiConfig';
import { useNotifications } from '../components/NotificationSystem';

interface WhatsAppContextType {
  status: 'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting' | 'error';
  connectedUser: string | null;
  qrCode: string | null;
  serverOnline: boolean;
  isLoading: boolean;
  fetchStatus: (automaticRetry?: boolean) => Promise<void>;
  handleManualConnect: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

const WhatsAppContext = createContext<WhatsAppContextType | null>(null);

export const WhatsAppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = useState<'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting' | 'error'>('connecting');
  const [connectedUser, setConnectedUser] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [serverOnline, setServerOnline] = useState<boolean>(false);
  
  const { notify, dismiss } = useNotifications();
  const notificationIdRef = useRef<number | null>(null);
  const isRecoveringRef = useRef<boolean>(false);
  
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const activeBackendUrl = getWhatsAppBackendUrl();
  const socketRef = useRef<Socket | null>(null);

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const scheduleStatusRetry = () => {
    if (retryTimerRef.current !== null) return;

    const delays = [2000, 5000, 10000, 20000];
    const delay = delays[Math.min(retryAttemptRef.current, delays.length - 1)];
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      fetchStatus(true);
    }, delay);
  };

  const fetchStatus = async (automaticRetry = false) => {
    if (!automaticRetry) setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/status`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        retryAttemptRef.current = 0;
        clearRetryTimer();
        setServerOnline(true);
        
        if (isRecoveringRef.current) {
          isRecoveringRef.current = false;
          if (notificationIdRef.current) dismiss(notificationIdRef.current);
          notify({
            type: 'success',
            title: 'WhatsApp Ready ✓',
            message: 'The WhatsApp service is connected.',
            duration: 4000
          });
        }

        if (data.connected) {
          setStatus('connected');
          setConnectedUser(data.user);
        } else if (data.qrCode) {
          setStatus('qr_ready');
          setQrCode(data.qrCode);
        } else if (data.diagnostics?.last_disconnect_code === 401 || data.diagnostics?.last_disconnect_reason === 'Logged out') {
          setStatus('logged_out');
        } else if (data.diagnostics?.reconnect_attempts > 0) {
          setStatus('reconnecting');
        } else if (data.isConnecting) {
          setStatus('connecting');
        } else {
          setStatus('connecting');
        }
      } else {
        throw new Error('Not OK');
      }
    } catch (err) {
      setServerOnline(false);
      
      if (!isRecoveringRef.current) {
        isRecoveringRef.current = true;
        const id = notify({
          type: 'loading',
          title: 'Connecting to WhatsApp',
          message: 'Waking up the WhatsApp service… This may take a few seconds.',
          duration: 0,
          dismissible: false
        });
        notificationIdRef.current = id;
      }
      
      scheduleStatusRetry();
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualConnect = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${activeBackendUrl}/api/whatsapp/connect`, { method: 'POST' });
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
      scheduleStatusRetry();
    } finally {
      setIsLoading(false);
    }
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

  useEffect(() => {
    fetchStatus();

    try {
      const socket = io(activeBackendUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 12000,
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        retryAttemptRef.current = 0;
        clearRetryTimer();
        setServerOnline(true);
        fetchStatus(true);
      });

      socket.on('disconnect', () => {
        setServerOnline(false);
        scheduleStatusRetry();
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
      clearRetryTimer();
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('qr');
        socketRef.current.off('status');
        socketRef.current.disconnect();
      }
    };
  }, [activeBackendUrl]);

  const value = {
    status,
    connectedUser,
    qrCode,
    serverOnline,
    isLoading,
    fetchStatus,
    handleManualConnect,
    handleLogout
  };

  return <WhatsAppContext.Provider value={value}>{children}</WhatsAppContext.Provider>;
};

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) throw new Error('useWhatsApp must be used within a WhatsAppProvider');
  return context;
};
