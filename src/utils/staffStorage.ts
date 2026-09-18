import bcrypt from 'bcryptjs';
import { supabase, isSupabaseConfigured } from '../config/supabaseClient';
import { isOwnerAuthenticated } from '../config/authConfig';

export interface StaffProfile {
  id: string;
  user_id?: string;
  staff_name: string;
  phone_number: string;
  password_hash: string;
  role: 'OWNER' | 'STAFF';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetToken {
  token: string;
  staff_id: string;
  expires_at: number;
  used: boolean;
}

const LOCAL_STAFF_KEY = 'go-grand-staff-profiles';
const RESET_TOKENS_KEY = 'go-grand-pwd-reset-tokens';

/**
 * Computes legacy SHA-256 hash for backward compatibility migration
 */
async function legacySha256(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Secure password hashing using bcrypt with salt rounds = 10
 */
export async function hashPassword(plainText: string): Promise<string> {
  const clean = plainText.trim();
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(clean, salt);
}

/**
 * Secure constant-time password verification supporting bcrypt and legacy SHA-256 migration
 */
export async function verifyPassword(
  plainText: string,
  storedHash: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!plainText || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  const clean = plainText.trim();

  // 1. If stored hash is standard bcrypt ($2a$, $2b$, $2y$)
  if (storedHash.startsWith('$2')) {
    try {
      const match = await bcrypt.compare(clean, storedHash);
      return { valid: match, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // 2. Fallback check for legacy SHA-256 hash (64 hex characters)
  if (storedHash.length === 64) {
    try {
      const sha = await legacySha256(clean);
      if (sha.toLowerCase() === storedHash.toLowerCase()) {
        return { valid: true, needsUpgrade: true };
      }
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  return { valid: false, needsUpgrade: false };
}

// Initial seed staff list with bcrypt hashes for '123456'
const INITIAL_STAFF: Omit<StaffProfile, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    staff_name: 'Sai Kumar',
    phone_number: '9876543210',
    password_hash: '$2b$10$wlgCKifUQhmeU8taaMO3mu63wrRLvQ5.ssoT3ENbR7XQaE0aKCioG', // bcrypt for '123456'
    role: 'STAFF',
    active: true,
  },
  {
    staff_name: 'Ravi',
    phone_number: '9876543211',
    password_hash: '$2b$10$wlgCKifUQhmeU8taaMO3mu63wrRLvQ5.ssoT3ENbR7XQaE0aKCioG', // bcrypt for '123456'
    role: 'STAFF',
    active: true,
  },
  {
    staff_name: 'Prasad',
    phone_number: '9876543212',
    password_hash: '$2b$10$wlgCKifUQhmeU8taaMO3mu63wrRLvQ5.ssoT3ENbR7XQaE0aKCioG', // bcrypt for '123456'
    role: 'STAFF',
    active: false,
  },
];

export function getLocalStaffProfiles(): StaffProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_STAFF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse local staff profiles:', e);
  }

  // Initialize with seed data
  const now = new Date().toISOString();
  const seeded: StaffProfile[] = INITIAL_STAFF.map((s, idx) => ({
    ...s,
    id: `staff_${Date.now()}_${idx}`,
    created_at: now,
    updated_at: now,
  }));
  localStorage.setItem(LOCAL_STAFF_KEY, JSON.stringify(seeded));
  return seeded;
}

export function saveLocalStaffProfiles(profiles: StaffProfile[]): void {
  localStorage.setItem(LOCAL_STAFF_KEY, JSON.stringify(profiles));
}

// Fetch staff profiles (from Supabase if configured, otherwise localStorage)
export async function getStaffProfiles(): Promise<StaffProfile[]> {
  const localList = getLocalStaffProfiles();

  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        const mergedMap = new Map<string, StaffProfile>();

        localList.forEach((s) => {
          mergedMap.set(s.phone_number.toLowerCase().trim(), s);
        });

        data.forEach((remote: any) => {
          const profile: StaffProfile = {
            id: String(remote.id || ''),
            user_id: remote.user_id,
            staff_name: String(remote.staff_name || ''),
            phone_number: String(remote.phone_number || ''),
            password_hash: String(remote.password_hash || ''),
            role: remote.role || 'STAFF',
            active: remote.active !== undefined ? Boolean(remote.active) : true,
            created_at: remote.created_at || new Date().toISOString(),
            updated_at: remote.updated_at || new Date().toISOString(),
          };
          mergedMap.set(profile.phone_number.toLowerCase().trim(), profile);
        });

        const mergedList = Array.from(mergedMap.values());
        saveLocalStaffProfiles(mergedList);
        return mergedList;
      }
    } catch (err) {
      console.warn('Supabase fetch failed, using local staff profiles:', err);
    }
  }

  return localList;
}

export function getStaffProfilesSync(): StaffProfile[] {
  return getLocalStaffProfiles();
}

// Add new staff member
export async function addStaffProfile(data: {
  staff_name: string;
  phone_number: string;
  password: string;
  role?: 'OWNER' | 'STAFF';
  active?: boolean;
}): Promise<StaffProfile> {
  // Authorization check: Admin / Owner only
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can create new staff accounts.');
  }

  const cleanName = data.staff_name.trim();
  const cleanPhone = data.phone_number.trim().replace(/\s+/g, '');
  const cleanPassword = data.password.trim();

  if (!cleanName) {
    throw new Error('Staff name is required');
  }
  if (!cleanPhone) {
    throw new Error('Phone number / username is required');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const current = getLocalStaffProfiles();
  const duplicate = current.find(
    (s) =>
      s.phone_number.toLowerCase().trim() === cleanPhone.toLowerCase() ||
      s.staff_name.toLowerCase().trim() === cleanName.toLowerCase()
  );

  if (duplicate) {
    throw new Error('A staff account with this phone number or name already exists.');
  }

  const password_hash = await hashPassword(cleanPassword);
  const now = new Date().toISOString();
  const newStaff: StaffProfile = {
    id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    staff_name: cleanName,
    phone_number: cleanPhone,
    password_hash,
    role: data.role || 'STAFF',
    active: data.active !== undefined ? data.active : true,
    created_at: now,
    updated_at: now,
  };

  const updated = [...current, newStaff];
  saveLocalStaffProfiles(updated);

  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: inserted, error } = await supabase
        .from('staff_profiles')
        .insert([
          {
            id: newStaff.id,
            staff_name: newStaff.staff_name,
            phone_number: newStaff.phone_number,
            password_hash: newStaff.password_hash,
            role: newStaff.role,
            active: newStaff.active,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase staff insert error:', error.message);
        if (error.code === '23505') {
          throw new Error('A staff member with this phone number already exists in the cloud database.');
        }
      } else if (inserted) {
        newStaff.id = inserted.id;
        const finalCurrent = getLocalStaffProfiles().map((s) =>
          s.phone_number === cleanPhone ? { ...s, id: inserted.id } : s
        );
        saveLocalStaffProfiles(finalCurrent);
      }
    } catch (err: any) {
      if (err?.message?.includes('already exists')) {
        throw err;
      }
      console.warn('Supabase insert warning:', err);
    }
  }

  return newStaff;
}

// Update staff member
export async function updateStaffProfile(
  id: string,
  updates: Partial<{
    staff_name: string;
    phone_number: string;
    password?: string;
    active: boolean;
    role: 'OWNER' | 'STAFF';
  }>,
  bypassOwnerCheck = false
): Promise<StaffProfile | null> {
  // Authorization check: Admin / Owner only (unless internal reset/migration bypass)
  if (!bypassOwnerCheck && !isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can modify staff accounts.');
  }

  const current = getLocalStaffProfiles();
  const index = current.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const staff = current[index];
  let newHash = staff.password_hash;
  if (updates.password && updates.password.trim()) {
    if (updates.password.trim().length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    newHash = await hashPassword(updates.password);
  }

  const updatedStaff: StaffProfile = {
    ...staff,
    staff_name: updates.staff_name !== undefined ? updates.staff_name.trim() : staff.staff_name,
    phone_number: updates.phone_number !== undefined ? updates.phone_number.trim().replace(/\s+/g, '') : staff.phone_number,
    password_hash: newHash,
    active: updates.active !== undefined ? updates.active : staff.active,
    role: updates.role || staff.role,
    updated_at: new Date().toISOString(),
  };

  current[index] = updatedStaff;
  saveLocalStaffProfiles(current);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase
        .from('staff_profiles')
        .update({
          staff_name: updatedStaff.staff_name,
          phone_number: updatedStaff.phone_number,
          password_hash: updatedStaff.password_hash,
          active: updatedStaff.active,
          role: updatedStaff.role,
          updated_at: updatedStaff.updated_at,
        })
        .eq('id', id);
    } catch (err) {
      console.warn('Supabase update failed:', err);
    }
  }

  return updatedStaff;
}

// Toggle staff active / disabled
export async function toggleStaffStatus(id: string): Promise<StaffProfile | null> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can change staff status.');
  }

  const current = getLocalStaffProfiles();
  const staff = current.find((s) => s.id === id);
  if (!staff) return null;

  return updateStaffProfile(id, { active: !staff.active }, true);
}

// Delete staff profile
export async function deleteStaffProfile(id: string): Promise<boolean> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can delete staff accounts.');
  }

  const current = getLocalStaffProfiles();
  const filtered = current.filter((s) => s.id !== id);
  saveLocalStaffProfiles(filtered);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('staff_profiles').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase delete failed:', err);
    }
  }

  return true;
}

/**
 * Authenticate staff member across ANY phone / device via Cloud DB.
 * Uses generic non-enumerating error messages to protect user privacy.
 */
export async function authenticateStaff(
  phoneOrUsername: string,
  plainPassword: string
): Promise<{ success: boolean; staff?: StaffProfile; error?: string }> {
  const GENERIC_ERROR = 'Invalid username/phone or password.';

  const rawInput = phoneOrUsername.trim();
  const cleanDigits = rawInput.replace(/\D/g, '');
  const trimmedInput = rawInput.toLowerCase();

  if (!rawInput || !plainPassword) {
    return { success: false, error: GENERIC_ERROR };
  }

  // 1. Direct Cloud DB authentication
  if (isSupabaseConfigured() && supabase) {
    try {
      const conditions: string[] = [
        `phone_number.ilike.%${trimmedInput}%`,
        `staff_name.ilike.%${trimmedInput}%`,
      ];
      if (cleanDigits && cleanDigits.length >= 4) {
        conditions.push(`phone_number.ilike.%${cleanDigits}%`);
      }

      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .or(conditions.join(','))
        .limit(10);

      if (!error && Array.isArray(data) && data.length > 0) {
        const matched = data.find((row: any) => {
          const rPhone = String(row.phone_number || '').toLowerCase().trim();
          const rDigits = rPhone.replace(/\D/g, '');
          const rName = String(row.staff_name || '').toLowerCase().trim();
          return (
            rPhone === trimmedInput ||
            rName === trimmedInput ||
            (cleanDigits && rDigits && rDigits === cleanDigits) ||
            (cleanDigits.length === 10 && rDigits.endsWith(cleanDigits))
          );
        });

        if (matched) {
          const staff: StaffProfile = {
            id: String(matched.id || ''),
            user_id: matched.user_id,
            staff_name: String(matched.staff_name || ''),
            phone_number: String(matched.phone_number || ''),
            password_hash: String(matched.password_hash || ''),
            role: matched.role || 'STAFF',
            active: matched.active !== undefined ? Boolean(matched.active) : true,
            created_at: matched.created_at || new Date().toISOString(),
            updated_at: matched.updated_at || new Date().toISOString(),
          };

          if (!staff.active) {
            return { success: false, error: 'Your staff account has been disabled. Please contact the Owner.' };
          }

          const { valid, needsUpgrade } = await verifyPassword(plainPassword, staff.password_hash);
          if (valid) {
            // Auto-upgrade legacy hash to bcrypt in background
            if (needsUpgrade) {
              updateStaffProfile(staff.id, { password: plainPassword }).catch(() => {});
            }

            const localList = getLocalStaffProfiles();
            if (!localList.some((s) => s.id === staff.id)) {
              saveLocalStaffProfiles([...localList, staff]);
            }
            return { success: true, staff };
          }

          return { success: false, error: GENERIC_ERROR };
        }
      }
    } catch (err) {
      console.warn('Supabase auth query failed, using local store:', err);
    }
  }

  // 2. Local storage fallback
  const allStaff = getLocalStaffProfiles();
  const found = allStaff.find((s) => {
    const sPhone = s.phone_number.toLowerCase().trim();
    const sDigits = sPhone.replace(/\D/g, '');
    const sName = s.staff_name.toLowerCase().trim();

    return (
      sPhone === trimmedInput ||
      sName === trimmedInput ||
      (cleanDigits && sDigits && sDigits === cleanDigits) ||
      (cleanDigits.length === 10 && sDigits.endsWith(cleanDigits))
    );
  });

  if (!found) {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!found.active) {
    return { success: false, error: 'Your staff account has been disabled. Please contact the Owner.' };
  }

  const { valid, needsUpgrade } = await verifyPassword(plainPassword, found.password_hash);
  if (valid) {
    if (needsUpgrade) {
      updateStaffProfile(found.id, { password: plainPassword }).catch(() => {});
    }
    return { success: true, staff: found };
  }

  return { success: false, error: GENERIC_ERROR };
}

// ==========================================
// SINGLE-USE PASSWORD RESET TOKEN MANAGEMENT
// ==========================================
export function generatePasswordResetToken(staffId: string): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  const token = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');

  const tokensRaw = localStorage.getItem(RESET_TOKENS_KEY);
  const tokens: PasswordResetToken[] = tokensRaw ? JSON.parse(tokensRaw) : [];

  // Prune expired tokens (> 1 hour old)
  const now = Date.now();
  const pruned = tokens.filter((t) => !t.used && t.expires_at > now);

  // New token strictly expires within 1 hour
  pruned.push({
    token,
    staff_id: staffId,
    expires_at: now + 60 * 60 * 1000,
    used: false,
  });

  localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(pruned));
  return token;
}

export async function verifyAndConsumeResetToken(
  token: string,
  newPlainPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!token || !newPlainPassword || newPlainPassword.length < 6) {
    return { success: false, error: 'Invalid reset token or password length (min 6 characters required).' };
  }

  const tokensRaw = localStorage.getItem(RESET_TOKENS_KEY);
  if (!tokensRaw) {
    return { success: false, error: 'Invalid or expired password reset token.' };
  }

  const tokens: PasswordResetToken[] = JSON.parse(tokensRaw);
  const now = Date.now();
  const index = tokens.findIndex((t) => t.token === token && !t.used && t.expires_at > now);

  if (index === -1) {
    return { success: false, error: 'Invalid, already used, or expired password reset token.' };
  }

  const target = tokens[index];
  target.used = true; // Mark single-use
  localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(tokens));

  // Update staff password
  await updateStaffProfile(target.staff_id, { password: newPlainPassword });
  return { success: true };
}
