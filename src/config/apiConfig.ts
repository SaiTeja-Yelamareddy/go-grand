/**
 * Centralized API & WhatsApp Backend URL Resolver
 */

export const PRODUCTION_WHATSAPP_BACKEND_URL = 'https://go-grand.onrender.com';

export function getWhatsAppBackendUrl(): string {
  const isProduction =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  // 1. Explicit environment variable
  const rawEnv = import.meta.env.VITE_WHATSAPP_SERVER_URL;
  let envUrl = typeof rawEnv === 'string' ? rawEnv.trim().replace(/\/+$/, '') : '';

  // In production, sanitize accidental localhost or obsolete domains in envUrl
  if (isProduction && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1') || envUrl === 'https://go-grand-whatsapp.onrender.com')) {
    envUrl = PRODUCTION_WHATSAPP_BACKEND_URL;
  }

  // 2. Local storage override (allows owner to configure/change live cloud backend URL directly in the UI if needed)
  let storedUrl = '';
  try {
    const rawStored = localStorage.getItem('go-grand-whatsapp-server-url');
    if (rawStored && typeof rawStored === 'string') {
      const candidate = rawStored.trim().replace(/\/+$/, '');
      // If stored value is localhost or old wrong Render URL, clear it so it doesn't override production
      if (
        candidate === 'http://localhost:5000' ||
        candidate === 'http://127.0.0.1:5000' ||
        candidate === 'https://go-grand-whatsapp.onrender.com' ||
        (isProduction && (candidate.includes('localhost') || candidate.includes('127.0.0.1')))
      ) {
        localStorage.removeItem('go-grand-whatsapp-server-url');
      } else if (candidate.startsWith('http')) {
        storedUrl = candidate;
      }
    }
  } catch {
    // ignore
  }

  // Determine final URL based on resolution priority:
  let finalUrl = PRODUCTION_WHATSAPP_BACKEND_URL;
  if (storedUrl) {
    finalUrl = storedUrl;
  } else if (envUrl && envUrl.startsWith('http')) {
    finalUrl = envUrl;
  } else if (!isProduction) {
    finalUrl = 'http://localhost:5000';
  } else {
    finalUrl = PRODUCTION_WHATSAPP_BACKEND_URL;
  }

  // Debug logging
  console.log(`[WHATSAPP CONFIG] Backend URL: ${finalUrl}`);
  console.log(`[WHATSAPP CONFIG] Environment URL: ${envUrl || '(none)'}`);
  console.log(`[WHATSAPP CONFIG] Stored URL: ${storedUrl || '(none)'}`);
  console.log(`[WHATSAPP CONFIG] Final URL: ${finalUrl}`);

  return finalUrl;
}
