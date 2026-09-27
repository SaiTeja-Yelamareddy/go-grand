import bcrypt from 'bcryptjs';
import type { StaffProfile } from '../utils/staffStorage';

// Secure Owner Authentication Config (Default bcrypt hash for 'admin123')
const DEFAULT_OWNER_ID = 'admin';
const DEFAULT_OWNER_HASH = '$2b$10$VcCiV3Gyl8s3MUWhjw.WD.TWJ9OTTDq.2VwczlFdDJstm4pgjeU.2';

const OWNER_LOGIN_ID = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OWNER_LOGIN_ID) || DEFAULT_OWNER_ID;
const OWNER_PASSWORD_HASH = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OWNER_PASSWORD_HASH) || DEFAULT_OWNER_HASH;

import { supabase, isSupabaseConfigured } from './supabaseClient';

export const OWNER_AUTH_KEY = 'go-grand-owner-session';
export const STAFF_AUTH_KEY = 'go-grand-staff-session';
export const OWNER_CREDENTIALS_STORAGE_KEY = 'go-grand-owner-credentials';

// Session Lifetimes (in milliseconds)
export const OWNER_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 Hours
export const STAFF_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 Hours

export interface OwnerCredentials {
  loginId: string;
  passwordHash: string;
}

/**
 * Retrieves the current owner credentials from localStorage or defaults.
 */
export function getStoredOwnerCredentials(): OwnerCredentials {
  try {
    const raw = localStorage.getItem(OWNER_CREDENTIALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.loginId === 'string' && typeof parsed.passwordHash === 'string') {
        return {
          loginId: parsed.loginId.trim(),
          passwordHash: parsed.passwordHash,
        };
      }
    }
  } catch (e) {
    console.error('Failed to get stored owner credentials:', e);
  }

  return {
    loginId: OWNER_LOGIN_ID,
    passwordHash: OWNER_PASSWORD_HASH,
  };
}

/**
 * Returns the currently active owner login ID.
 */
export function getOwnerLoginId(): string {
  try {
    const rawSession = sessionStorage.getItem(OWNER_AUTH_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed?.loginId) return parsed.loginId;
    }
  } catch {}
  return getStoredOwnerCredentials().loginId;
}

/**
 * Updates owner login credentials (ID & password), syncing with localStorage and Supabase.
 * Keeps current owner session active.
 */
export async function updateOwnerCredentials(newLoginId: string, newPassword: string): Promise<boolean> {
  const cleanId = newLoginId.trim();
  if (!cleanId || !newPassword) {
    throw new Error('Login ID and Password cannot be empty.');
  }

  // Hash new password using bcrypt
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  const creds: OwnerCredentials = {
    loginId: cleanId,
    passwordHash,
  };

  // 1. Save to localStorage
  try {
    localStorage.setItem(OWNER_CREDENTIALS_STORAGE_KEY, JSON.stringify(creds));
  } catch (e) {
    console.error('Failed to save owner credentials locally:', e);
  }

  // 2. Keep current session active with new login ID
  try {
    const raw = sessionStorage.getItem(OWNER_AUTH_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.token) {
        session.loginId = cleanId;
        sessionStorage.setItem(OWNER_AUTH_KEY, JSON.stringify(session));
      }
    }
  } catch (e) {
    console.warn('Could not update active session:', e);
  }

  // 3. Sync to Supabase app_settings if configured
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'owner_credentials',
          value: { login_id: cleanId, password_hash: passwordHash },
          updated_at: new Date().toISOString(),
        });
      if (error) {
        console.warn('Could not sync owner credentials to Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Supabase owner credentials sync failed:', err);
    }
  }

  return true;
}

/**
 * Sync owner credentials from Supabase app_settings on startup.
 */
export async function syncOwnerCredentialsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'owner_credentials')
      .single();

    if (data && !error && data.value) {
      const { login_id, password_hash } = data.value;
      if (typeof login_id === 'string' && typeof password_hash === 'string') {
        localStorage.setItem(
          OWNER_CREDENTIALS_STORAGE_KEY,
          JSON.stringify({
            loginId: login_id.trim(),
            passwordHash: password_hash,
          })
        );
      }
    }
  } catch (err) {
    console.warn('Failed to sync owner credentials from Supabase:', err);
  }
}

interface OwnerSession {
  token: string;
  loginId: string;
  createdAt: number;
  expiresAt: number;
}

interface StaffSession {
  token: string;
  staff: StaffProfile;
  createdAt: number;
  expiresAt: number;
}

function generateSecureToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// OWNER AUTHENTICATION
// ==========================================
export function isOwnerAuthenticated(): boolean {
  try {
    const raw = sessionStorage.getItem(OWNER_AUTH_KEY);
    if (!raw) return false;

    // Support legacy boolean flag during migration
    if (raw === 'true') {
      logoutOwner();
      return false;
    }

    const session: OwnerSession = JSON.parse(raw);
    const now = Date.now();

    if (!session || !session.token || !session.expiresAt || now >= session.expiresAt) {
      logoutOwner();
      return false;
    }

    // Sliding window renewal on active usage
    if (session.expiresAt - now < OWNER_SESSION_TTL_MS / 2) {
      session.expiresAt = now + OWNER_SESSION_TTL_MS;
      sessionStorage.setItem(OWNER_AUTH_KEY, JSON.stringify(session));
    }

    return true;
  } catch {
    logoutOwner();
    return false;
  }
}

export async function loginOwner(loginId: string, pass: string): Promise<boolean> {
  const cleanId = loginId.trim();
  if (!cleanId || !pass) return false;

  const currentCreds = getStoredOwnerCredentials();

  let isIdMatch = cleanId === currentCreds.loginId;
  let isPasswordValid = false;

  if (isIdMatch) {
    try {
      isPasswordValid = await bcrypt.compare(pass, currentCreds.passwordHash);
    } catch {
      isPasswordValid = false;
    }
  }

  // If local check failed, check if remote Supabase has updated credentials
  if (!isIdMatch || !isPasswordValid) {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'owner_credentials')
          .single();

        if (data?.value?.login_id && data?.value?.password_hash) {
          const remoteId = String(data.value.login_id).trim();
          const remoteHash = String(data.value.password_hash);
          localStorage.setItem(
            OWNER_CREDENTIALS_STORAGE_KEY,
            JSON.stringify({ loginId: remoteId, passwordHash: remoteHash })
          );

          if (cleanId === remoteId) {
            isPasswordValid = await bcrypt.compare(pass, remoteHash);
            if (isPasswordValid) {
              isIdMatch = true;
            }
          }
        }
      } catch {}
    }
  }

  if (isIdMatch && isPasswordValid) {
    const now = Date.now();
    const session: OwnerSession = {
      token: generateSecureToken(),
      loginId: cleanId,
      createdAt: now,
      expiresAt: now + OWNER_SESSION_TTL_MS,
    };
    sessionStorage.setItem(OWNER_AUTH_KEY, JSON.stringify(session));
    return true;
  }

  return false;
}

export function logoutOwner(): void {
  try {
    sessionStorage.removeItem(OWNER_AUTH_KEY);
  } catch {}
}

// ==========================================
// STAFF AUTHENTICATION & SESSION
// ==========================================
export function getCurrentStaff(): StaffProfile | null {
  try {
    const raw = sessionStorage.getItem(STAFF_AUTH_KEY) || localStorage.getItem(STAFF_AUTH_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const now = Date.now();

    // Check if wrapped in session object
    if (parsed.staff && parsed.expiresAt) {
      const session: StaffSession = parsed;
      if (now >= session.expiresAt || !session.staff?.active) {
        logoutStaff();
        return null;
      }

      // Sliding window renewal
      if (session.expiresAt - now < STAFF_SESSION_TTL_MS / 2) {
        session.expiresAt = now + STAFF_SESSION_TTL_MS;
        const serialized = JSON.stringify(session);
        sessionStorage.setItem(STAFF_AUTH_KEY, serialized);
        localStorage.setItem(STAFF_AUTH_KEY, serialized);
      }

      return session.staff;
    }

    // Legacy unexpired format migration -> wrap in secure session
    if (parsed.id && parsed.staff_name && parsed.active) {
      setCurrentStaff(parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse current staff session:', e);
    logoutStaff();
  }
  return null;
}

export function setCurrentStaff(staff: StaffProfile): void {
  const now = Date.now();
  const session: StaffSession = {
    token: generateSecureToken(),
    staff,
    createdAt: now,
    expiresAt: now + STAFF_SESSION_TTL_MS,
  };
  const data = JSON.stringify(session);
  sessionStorage.setItem(STAFF_AUTH_KEY, data);
  localStorage.setItem(STAFF_AUTH_KEY, data);
}

export function isStaffAuthenticated(): boolean {
  const staff = getCurrentStaff();
  return Boolean(staff && staff.active);
}

export function logoutStaff(): void {
  try {
    sessionStorage.removeItem(STAFF_AUTH_KEY);
    localStorage.removeItem(STAFF_AUTH_KEY);
  } catch {}
}

export function logoutAll(): void {
  logoutOwner();
  logoutStaff();
}
