import { supabase } from '../config/supabaseClient';
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

export const SERVICES_STORAGE_KEY = 'go-ground-services';

export const DEFAULT_SERVICE_SECTIONS: ServiceSection[] = [
  { id: 'sec-basic-wash', name: 'Basic Wash', services: [] },
  { id: 'sec-interior-cleaning', name: 'Interior Cleaning', services: [] },
  { id: 'sec-exterior-cleaning', name: 'Exterior Cleaning', services: [] },
  { id: 'sec-full-wash', name: 'Full Wash', services: [] },
  { id: 'sec-wax-polish', name: 'Wax Polish', services: [] },
  { id: 'sec-interior-exterior', name: 'Interior + Exterior', services: [] },
  { id: 'sec-full-detailing', name: 'Full Detailing', services: [] },
];

export function getServiceSections(): ServiceSection[] {
  try {
    const data = localStorage.getItem(SERVICES_STORAGE_KEY);
    if (!data) {
      localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(DEFAULT_SERVICE_SECTIONS));
      return DEFAULT_SERVICE_SECTIONS;
    }
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_SERVICE_SECTIONS;
  } catch (e) {
    console.error('Failed to parse go-ground-services:', e);
    return DEFAULT_SERVICE_SECTIONS;
  }
}

export function saveServiceSections(sections: ServiceSection[]): void {
  localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(sections));
}

export async function syncServiceSectionsFromSupabase(): Promise<ServiceSection[]> {
  try {
    const { data, error } = await supabase
      .from('service_sections')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Supabase fetch service_sections error:', error.message);
      return getServiceSections();
    }

    if (data && data.length > 0) {
      const sections: ServiceSection[] = data.map((d: any) => ({
        id: d.id,
        name: d.name,
        services: Array.isArray(d.services) ? d.services : [],
      }));
      saveServiceSections(sections);
      return sections;
    }
  } catch (err) {
    console.error('❌ Supabase fetch service_sections exception:', err);
  }
  return getServiceSections();
}

export async function addServiceSection(name: string): Promise<ServiceSection> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can add service sections.');
  }

  const cleanName = name.trim();
  const newSection: ServiceSection = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    services: [],
  };

  const sections = getServiceSections();
  const updated = [...sections, newSection];
  saveServiceSections(updated);

  try {
    const { error } = await supabase.from('service_sections').insert([
      {
        id: newSection.id,
        name: newSection.name,
        services: [],
      },
    ]);
    if (error) {
      console.error('❌ Supabase insert service_section error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase insert service_section exception:', err);
  }

  return newSection;
}

export async function updateServiceSectionName(sectionId: string, newName: string): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can update service section names.');
  }

  const cleanName = newName.trim();
  const sections = getServiceSections();
  const updated = sections.map((sec) => (sec.id === sectionId ? { ...sec, name: cleanName } : sec));
  saveServiceSections(updated);

  try {
    const { error } = await supabase
      .from('service_sections')
      .update({ name: cleanName })
      .eq('id', sectionId);
    if (error) {
      console.error('❌ Supabase update service_section name error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase update service_section name exception:', err);
  }
}

export async function deleteServiceSection(sectionId: string): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can delete service sections.');
  }

  const sections = getServiceSections().filter((sec) => sec.id !== sectionId);
  saveServiceSections(sections);

  try {
    const { error } = await supabase.from('service_sections').delete().eq('id', sectionId);
    if (error) {
      console.error('❌ Supabase delete service_section error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase delete service_section exception:', err);
  }
}

export async function addServiceToSection(sectionId: string, serviceName: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can add services.');
  }

  const cleanServiceName = serviceName.trim();
  const newServiceItem: ServiceItem = {
    id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanServiceName,
  };

  const sections = getServiceSections();
  let targetServices: ServiceItem[] = [];

  const updated = sections.map((sec) => {
    if (sec.id === sectionId) {
      targetServices = [...sec.services, newServiceItem];
      return {
        ...sec,
        services: targetServices,
      };
    }
    return sec;
  });

  saveServiceSections(updated);

  try {
    const { error } = await supabase
      .from('service_sections')
      .update({ services: targetServices })
      .eq('id', sectionId);
    if (error) {
      console.error('❌ Supabase add service to section error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase add service to section exception:', err);
  }

  return updated;
}

export async function updateServiceName(sectionId: string, serviceId: string, newName: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can update services.');
  }

  const cleanName = newName.trim();
  const sections = getServiceSections();
  let targetServices: ServiceItem[] = [];

  const updated = sections.map((sec) => {
    if (sec.id === sectionId) {
      targetServices = sec.services.map((srv) => (srv.id === serviceId ? { ...srv, name: cleanName } : srv));
      return {
        ...sec,
        services: targetServices,
      };
    }
    return sec;
  });

  saveServiceSections(updated);

  try {
    const { error } = await supabase
      .from('service_sections')
      .update({ services: targetServices })
      .eq('id', sectionId);
    if (error) {
      console.error('❌ Supabase update service name error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase update service name exception:', err);
  }

  return updated;
}

export async function deleteServiceFromSection(sectionId: string, serviceId: string): Promise<ServiceSection[]> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can delete services.');
  }

  const sections = getServiceSections();
  let targetServices: ServiceItem[] = [];

  const updated = sections.map((sec) => {
    if (sec.id === sectionId) {
      targetServices = sec.services.filter((srv) => srv.id !== serviceId);
      return {
        ...sec,
        services: targetServices,
      };
    }
    return sec;
  });

  saveServiceSections(updated);

  try {
    const { error } = await supabase
      .from('service_sections')
      .update({ services: targetServices })
      .eq('id', sectionId);
    if (error) {
      console.error('❌ Supabase delete service from section error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase delete service from section exception:', err);
  }

  return updated;
}
