import React, { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationSystem';
import { getWhatsAppBackendUrl } from '../config/apiConfig';

export const WhatsAppHealthCheck: React.FC = () => {
  const { notify, dismiss } = useNotifications();
  const notificationIdRef = useRef<number | null>(null);
  const isRecoveringRef = useRef<boolean>(false);
  const isUnmountedRef = useRef<boolean>(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    let timeoutId: number;
    let attempt = 0;
    let connectedReported = false;

    const checkHealth = async () => {
      if (isUnmountedRef.current) return;
      const activeBackendUrl = getWhatsAppBackendUrl();

      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${activeBackendUrl}/health`, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(fetchTimeout);

        if (!res.ok) throw new Error('Not OK');

        const data = await res.json();
        const socketStatus = data?.whatsapp?.socket;

        if (socketStatus === 'open') {
          // Connected successfully
          if (isRecoveringRef.current) {
            isRecoveringRef.current = false;
            if (notificationIdRef.current) dismiss(notificationIdRef.current);
            notify({
              type: 'success',
              title: 'WhatsApp Ready ✓',
              message: 'The WhatsApp service is connected.',
              duration: 4000
            });
          } else if (!connectedReported) {
             // Do nothing for initial silent success, just stop polling
             connectedReported = true;
          }
          // Stop polling if we are open
          return;
        } else {
          // Backend is awake but WhatsApp is still connecting
          if (isRecoveringRef.current) {
             // Keep waiting...
             // Maybe update message to "WhatsApp is starting..."
             if (notificationIdRef.current) dismiss(notificationIdRef.current);
             notificationIdRef.current = notify({
                type: 'loading',
                title: 'WhatsApp is starting',
                message: 'The service is connecting automatically. Please wait…',
                duration: 0,
                dismissible: false
             });
          } else {
            isRecoveringRef.current = true;
            notificationIdRef.current = notify({
              type: 'loading',
              title: 'Connecting to WhatsApp',
              message: 'Waking up the WhatsApp service… This may take a few seconds.',
              duration: 0,
              dismissible: false
            });
          }
        }
      } catch (err) {
        // Backend offline / sleeping
        if (!isRecoveringRef.current) {
          isRecoveringRef.current = true;
          notificationIdRef.current = notify({
            type: 'loading',
            title: 'Connecting to WhatsApp',
            message: 'Waking up the WhatsApp service… This may take a few seconds.',
            duration: 0,
            dismissible: false
          });
        }
      }

      // Retry mechanism
      attempt++;
      // Backoff: 2s -> 5s -> 10s -> 20s -> every 20s
      const delays = [2000, 5000, 10000, 20000];
      const delay = delays[Math.min(attempt, delays.length - 1)];
      timeoutId = window.setTimeout(checkHealth, delay);
    };

    checkHealth();

    return () => {
      isUnmountedRef.current = true;
      clearTimeout(timeoutId);
    };
  }, [notify, dismiss]);

  return null;
};
