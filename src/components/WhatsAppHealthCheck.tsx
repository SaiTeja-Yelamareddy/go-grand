import React, { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationSystem';
import { getWhatsAppBackendUrl } from '../config/apiConfig';
import { isOwnerAuthenticated, isStaffAuthenticated } from '../config/authConfig';

export const WhatsAppHealthCheck: React.FC = () => {
  const { notify, dismiss } = useNotifications();
  const notificationIdRef = useRef<number | null>(null);
  const isRecoveringRef = useRef<boolean>(false);
  const isUnmountedRef = useRef<boolean>(false);

  useEffect(() => {
    isUnmountedRef.current = false;
    let timeoutId: number;
    let attempt = 0;

    // Only run the startup wake-up if the user is authenticated
    if (!isOwnerAuthenticated() && !isStaffAuthenticated()) {
      return;
    }

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

        if (isUnmountedRef.current) return;
        if (!res.ok) throw new Error('Not OK');

        // Backend is awake!
        if (isRecoveringRef.current) {
          isRecoveringRef.current = false;
          if (notificationIdRef.current) dismiss(notificationIdRef.current);
          notify({
            type: 'success',
            title: 'Backend Online',
            message: 'Cloud services are fully restored.',
            duration: 4000
          });
        }
        
        // Stop polling completely once the backend responds
        return;
      } catch (err) {
        if (isUnmountedRef.current) return;
        attempt++;
        
        // Only show notification if recovery takes a while (e.g. 3 attempts / ~17 seconds)
        if (attempt >= 3 && !isRecoveringRef.current) {
          isRecoveringRef.current = true;
          notificationIdRef.current = notify({
            type: 'loading',
            title: 'Waking Server',
            message: 'Starting cloud services in the background... This may take a minute.',
            duration: 0,
            dismissible: false
          });
        }

        // Backoff: 2s -> 4s -> 5s -> every 5s
        const delays = [2000, 4000, 5000];
        const delay = delays[Math.min(attempt - 1, delays.length - 1)];
        timeoutId = window.setTimeout(checkHealth, delay);
      }
    };

    checkHealth();

    return () => {
      isUnmountedRef.current = true;
      clearTimeout(timeoutId);
      if (notificationIdRef.current) {
        dismiss(notificationIdRef.current);
      }
    };
  }, [notify, dismiss]);

  return null;
};
