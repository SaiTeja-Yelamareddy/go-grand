import { supabase, isSupabaseConfigured } from '../config/supabaseClient';
import { isOwnerAuthenticated } from '../config/authConfig';

export interface ServiceItem {
  id: string;
  name: string;
}

export interface ServiceSection {
  id: string;
  name: string;
  services: ServiceItem[];
}

export const SERVICES_STORAGE_KEY = 'go-grand-services-catalog';

/**
 * Returns locally cached sections (empty array by default, NO hardcoded fallbacks).
 */
export function getServiceSections(): ServiceSection[] {
  try {
    const data = localStorage.getItem(SERVICES_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse cached services:', e);
  }
  return [];
}

export function saveServiceSections(sections: ServiceSection[]): void {
  try {
    localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(sections));
  } catch (e) {
    console.error('Failed to save services to localStorage:', e);
  }
}

/**
 * Loads service sections directly from Supabase (Single Source of Truth).
 * If Supabase has 0 sections, returns [] (NO hardcoded defaults).
 */
export async function syncServiceSectionsFromSupabase(): Promise<ServiceSection[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('service_sections')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Supabase fetch service_sections error:', error.message);
        return getServiceSections();
      }

      if (data && Array.isArray(data)) {
        const sections: ServiceSection[] = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          services: Array.isArray(d.services) ? d.services : [],
        }));
        saveServiceSections(sections);
        return sections;
      }
      
      saveServiceSections([]);
      return [];
    } catch (err) {
      console.error('❌ Supabase fetch service_sections exception:', err);
    }
  }
  return getServiceSections();
}

/**
 * Creates a new section in Supabase.
 * Only Owner can create sections.
 */
export async function addServiceSection(name: string): Promise<ServiceSection> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can add service sections.');
  }

  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('Section name cannot be empty.');
  }

  const newSection: ServiceSection = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    services: [],
  };

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  const { error } = await supabase.from('service_sections').insert([
    {
      id: newSection.id,
      name: newSection.name,
      services: [],
    },
  ]);

  if (error) {
    console.error('❌ Supabase insert service_section error:', error.message);
    throw new Error(error.message || 'Failed to create section in Supabase.');
  }

  // Refresh from Supabase to guarantee synchronized state
  await syncServiceSectionsFromSupabase();
  return newSection;
}

/**
 * Updates a section name in Supabase.
 */
export async function updateServiceSectionName(sectionId: string, newName: string): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can update service section names.');
  }

  const cleanName = newName.trim();
  if (!cleanName) {
    throw new Error('Section name cannot be empty.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  const { error } = await supabase
    .from('service_sections')
    .update({ name: cleanName })
    .eq('id', sectionId);

  if (error) {
    console.error('❌ Supabase update service_section name error:', error.message);
    throw new Error(error.message || 'Failed to update section in Supabase.');
  }

  await syncServiceSectionsFromSupabase();
}

/**
 * Deletes a section from Supabase.
 */
export async function deleteServiceSection(sectionId: string): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can delete service sections.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  const { error } = await supabase.from('service_sections').delete().eq('id', sectionId);

  if (error) {
    console.error('❌ Supabase delete service_section error:', error.message);
    throw new Error(error.message || 'Failed to delete section from Supabase.');
  }

  await syncServiceSectionsFromSupabase();
}

/**
 * Adds a service item to a section in Supabase.
 */
export async function addServiceToSection(sectionId: string, serviceName: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can add services.');
  }

  const cleanServiceName = serviceName.trim();
  if (!cleanServiceName) {
    throw new Error('Service name cannot be empty.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  // Fetch current section data directly from Supabase to avoid stale state
  const { data: currentSec, error: fetchErr } = await supabase
    .from('service_sections')
    .select('services')
    .eq('id', sectionId)
    .single();

  if (fetchErr) {
    throw new Error(fetchErr.message || 'Could not fetch section from Supabase.');
  }

  const existingServices: ServiceItem[] = Array.isArray(currentSec?.services) ? currentSec.services : [];
  const newServiceItem: ServiceItem = {
    id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: cleanServiceName,
  };

  const updatedServices = [...existingServices, newServiceItem];

  const { error: updateErr } = await supabase
    .from('service_sections')
    .update({ services: updatedServices })
    .eq('id', sectionId);

  if (updateErr) {
    console.error('❌ Supabase add service error:', updateErr.message);
    throw new Error(updateErr.message || 'Failed to add service in Supabase.');
  }

  return await syncServiceSectionsFromSupabase();
}

/**
 * Updates a service name inside a section in Supabase.
 */
export async function updateServiceName(sectionId: string, serviceId: string, newName: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can update services.');
  }

  const cleanName = newName.trim();
  if (!cleanName) {
    throw new Error('Service name cannot be empty.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  const { data: currentSec, error: fetchErr } = await supabase
    .from('service_sections')
    .select('services')
    .eq('id', sectionId)
    .single();

  if (fetchErr) {
    throw new Error(fetchErr.message || 'Could not fetch section from Supabase.');
  }

  const existingServices: ServiceItem[] = Array.isArray(currentSec?.services) ? currentSec.services : [];
  const updatedServices = existingServices.map((srv) =>
    srv.id === serviceId ? { ...srv, name: cleanName } : srv
  );

  const { error: updateErr } = await supabase
    .from('service_sections')
    .update({ services: updatedServices })
    .eq('id', sectionId);

  if (updateErr) {
    console.error('❌ Supabase update service error:', updateErr.message);
    throw new Error(updateErr.message || 'Failed to update service in Supabase.');
  }

  return await syncServiceSectionsFromSupabase();
}

/**
 * Deletes a service from a section in Supabase.
 */
export async function deleteServiceFromSection(sectionId: string, serviceId: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Unauthorized: Only the Owner can delete services.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase database connection is not configured.');
  }

  const { data: currentSec, error: fetchErr } = await supabase
    .from('service_sections')
    .select('services')
    .eq('id', sectionId)
    .single();

  if (fetchErr) {
    throw new Error(fetchErr.message || 'Could not fetch section from Supabase.');
  }

  const existingServices: ServiceItem[] = Array.isArray(currentSec?.services) ? currentSec.services : [];
  const updatedServices = existingServices.filter((srv) => srv.id !== serviceId);

  const { error: updateErr } = await supabase
    .from('service_sections')
    .update({ services: updatedServices })
    .eq('id', sectionId);

  if (updateErr) {
    console.error('❌ Supabase delete service error:', updateErr.message);
    throw new Error(updateErr.message || 'Failed to delete service from Supabase.');
  }

  return await syncServiceSectionsFromSupabase();
}
