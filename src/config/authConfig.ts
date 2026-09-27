import type { StaffProfile } from '../utils/staffStorage';
import { supabase } from './supabaseClient';
export const OWNER_AUTH_KEY = 'go-grand-owner-session';
export const STAFF_AUTH_KEY = 'go-grand-staff-session';

// Session Lifetimes (in milliseconds)
export const OWNER_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 Hours
export const STAFF_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 Hours


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

export async function isOwnerAuthenticated(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    
    const { data } = await supabase
      .from('owner_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('role', 'owner')
      .eq('active', true)
      .maybeSingle();
      
    return !!data;
  } catch {
    return false;
  }
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
