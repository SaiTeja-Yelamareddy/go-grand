import type { StaffProfile } from '../utils/staffStorage';

export const OWNER_CREDENTIALS = {
  LOGIN_ID: 'admin',
  PASSWORD: 'admin123',
};

export const OWNER_AUTH_KEY = 'go-grand-owner-authenticated';
export const STAFF_AUTH_KEY = 'go-grand-staff-session';

// ==========================================
// OWNER AUTHENTICATION
// ==========================================
export function isOwnerAuthenticated(): boolean {
  return sessionStorage.getItem(OWNER_AUTH_KEY) === 'true';
}

export function loginOwner(loginId: string, pass: string): boolean {
  if (
    loginId.trim() === OWNER_CREDENTIALS.LOGIN_ID &&
    pass === OWNER_CREDENTIALS.PASSWORD
  ) {
    sessionStorage.setItem(OWNER_AUTH_KEY, 'true');
    return true;
  }
  return false;
}

export function logoutOwner(): void {
  sessionStorage.removeItem(OWNER_AUTH_KEY);
}

// ==========================================
// STAFF AUTHENTICATION & SESSION
// ==========================================
export function getCurrentStaff(): StaffProfile | null {
  try {
    const raw = sessionStorage.getItem(STAFF_AUTH_KEY) || localStorage.getItem(STAFF_AUTH_KEY);
    if (raw) {
      const staff: StaffProfile = JSON.parse(raw);
      if (staff && staff.id && staff.staff_name) {
        return staff;
      }
    }
  } catch (e) {
    console.error('Failed to parse current staff session:', e);
  }
  return null;
}

export function setCurrentStaff(staff: StaffProfile): void {
  const data = JSON.stringify(staff);
  sessionStorage.setItem(STAFF_AUTH_KEY, data);
  localStorage.setItem(STAFF_AUTH_KEY, data);
}

export function isStaffAuthenticated(): boolean {
  const staff = getCurrentStaff();
  return Boolean(staff && staff.active);
}

export function logoutStaff(): void {
  sessionStorage.removeItem(STAFF_AUTH_KEY);
  localStorage.removeItem(STAFF_AUTH_KEY);
}

export function logoutAll(): void {
  logoutOwner();
  logoutStaff();
}
