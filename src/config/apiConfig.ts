/**
 * Centralized API & WhatsApp Backend URL Resolver
 */

export function getWhatsAppBackendUrl(): string {
  // 1. Explicit environment variable
  const envUrl = import.meta.env.VITE_WHATSAPP_SERVER_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Local storage override (allows owner to configure/change live cloud backend URL directly in the UI if needed)
  try {
    const customUrl = localStorage.getItem('go-grand-whatsapp-server-url');
    if (customUrl && typeof customUrl === 'string' && customUrl.trim().startsWith('http')) {
      return customUrl.trim().replace(/\/+$/, '');
    }
  } catch (e) {
    // ignore
  }

  // 3. If running on production (HTTPS / Vercel), use default production cloud backend or relative API
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // If backend is deployed on a custom sub-domain or cloud host
    return (import.meta.env.VITE_WHATSAPP_SERVER_URL || 'https://go-grand-whatsapp.onrender.com').replace(/\/+$/, '');
  }

  // 4. Default for local development
  return 'http://localhost:5000';
}
