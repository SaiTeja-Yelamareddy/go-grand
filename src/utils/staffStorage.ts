import { supabase, isSupabaseConfigured } from '../config/supabaseClient';

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

const LOCAL_STAFF_KEY = 'go-grand-staff-profiles';

// Helper: Secure SHA-256 hashing for passwords (never plaintext)
export async function hashPassword(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Initial seed staff list if no staff exist
const INITIAL_STAFF: Omit<StaffProfile, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    staff_name: 'Sai Kumar',
    phone_number: '9876543210',
    password_hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 123456
    role: 'STAFF',
    active: true,
  },
  {
    staff_name: 'Ravi',
    phone_number: '9876543211',
    password_hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 123456
    role: 'STAFF',
    active: true,
  },
  {
    staff_name: 'Prasad',
    phone_number: '9876543212',
    password_hash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 123456
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
        // Merge Supabase records with local records so no newly added staff is lost
        const mergedMap = new Map<string, StaffProfile>();
        
        // Add local first
        localList.forEach((s) => {
          mergedMap.set(s.phone_number.toLowerCase().trim(), s);
        });

        // Overlay Supabase data
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

// Synchronous getter for fast initial UI rendering
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
  const cleanName = data.staff_name.trim();
  const cleanPhone = data.phone_number.trim().replace(/\s+/g, '');
  const cleanPassword = data.password.trim();

  if (!cleanName) {
    throw new Error('Staff name is required');
  }
  if (!cleanPhone) {
    throw new Error('Phone number / username is required');
  }
  if (!cleanPassword) {
    throw new Error('Password is required');
  }

  // Check for duplicates in local store
  const current = getLocalStaffProfiles();
  const duplicate = current.find(
    (s) =>
      s.phone_number.toLowerCase().trim() === cleanPhone.toLowerCase() ||
      s.staff_name.toLowerCase().trim() === cleanName.toLowerCase()
  );

  if (duplicate) {
    throw new Error(
      `Staff member with this ${
        duplicate.phone_number.toLowerCase().trim() === cleanPhone.toLowerCase()
          ? 'phone number'
          : 'name'
      } already exists.`
    );
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

  // 1. Immediately save to local storage
  const updated = [...current, newStaff];
  saveLocalStaffProfiles(updated);

  // 2. Synchronize to Supabase if available
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: inserted, error } = await supabase
        .from('staff_profiles')
        .insert([
          {
            staff_name: newStaff.staff_name,
            phone_number: newStaff.phone_number,
            password_hash: newStaff.password_hash,
            role: newStaff.role,
            active: newStaff.active,
          },
        ])
        .select()
        .single();

      if (!error && inserted) {
        newStaff.id = inserted.id;
        // Update local with the real Supabase ID
        const finalCurrent = getLocalStaffProfiles().map((s) =>
          s.phone_number === cleanPhone ? { ...s, id: inserted.id } : s
        );
        saveLocalStaffProfiles(finalCurrent);
      } else if (error) {
        console.warn('Supabase insert warning:', error.message);
      }
    } catch (err) {
      console.warn('Supabase insert exception, saved locally:', err);
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
  }>
): Promise<StaffProfile | null> {
  const current = getLocalStaffProfiles();
  const index = current.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const staff = current[index];
  let newHash = staff.password_hash;
  if (updates.password && updates.password.trim()) {
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
  const current = getLocalStaffProfiles();
  const staff = current.find((s) => s.id === id);
  if (!staff) return null;

  return updateStaffProfile(id, { active: !staff.active });
}

// Delete staff profile
export async function deleteStaffProfile(id: string): Promise<boolean> {
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

// Authenticate staff member
export async function authenticateStaff(
  phoneOrUsername: string,
  plainPassword: string
): Promise<{ success: boolean; staff?: StaffProfile; error?: string }> {
  const rawInput = phoneOrUsername.trim();
  const cleanDigits = rawInput.replace(/\D/g, '');
  const trimmedInput = rawInput.toLowerCase();
  const hashedPassword = await hashPassword(plainPassword);

  // 1. Check Supabase if configured
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .or(`phone_number.ilike.${trimmedInput},staff_name.ilike.${trimmedInput}`)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        const staff = data[0] as StaffProfile;
        if (!staff.active) {
          return { success: false, error: 'Your staff account has been disabled. Please contact the Owner.' };
        }
        if (staff.password_hash === hashedPassword) {
          return { success: true, staff };
        } else {
          return { success: false, error: 'Incorrect Password. Please check your credentials.' };
        }
      }
    } catch (err) {
      console.warn('Supabase auth query failed, using local store:', err);
    }
  }

  // 2. Local storage authentication
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
    return { success: false, error: 'Staff account not found. Please verify your phone/username.' };
  }

  if (!found.active) {
    return { success: false, error: 'Your staff account has been disabled. Please contact the Owner.' };
  }

  if (found.password_hash === hashedPassword) {
    return { success: true, staff: found };
  }

  return { success: false, error: 'Incorrect Password. Please check your credentials.' };
}
