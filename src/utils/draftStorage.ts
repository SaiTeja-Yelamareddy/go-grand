import { supabase } from '../config/supabaseClient';
import { isOwnerAuthenticated, getCurrentStaff } from '../config/authConfig';

export interface JobRecord {
  id: string;
  vehicleNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleName?: string;
  location?: string;
  description?: string;
  services: string[] | string;
  service?: string;
  price: string;
  discount?: string;
  email?: string;
  address?: string;
  billNo?: string;
  status?: string;
  createdBy?: string;
  createdById?: string;
  createdAt: string;
}

export const JOBS_STORAGE_KEY = 'go-ground-jobs';
export const DRAFTS_STORAGE_KEY = 'go-ground-drafts';

// Convert DB snake_case row to JobRecord
export function mapRowToJobRecord(row: any): JobRecord {
  const serviceList: string[] = Array.isArray(row.services)
    ? row.services
    : typeof row.services === 'string' && row.services.trim()
    ? row.services.split(',').map((s: string) => s.trim())
    : row.service
    ? [row.service]
    : [];

  return {
    id: String(row.id || ''),
    vehicleNumber: String(row.vehicle_number || row.vehicleNumber || ''),
    customerName: String(row.customer_name || row.customerName || ''),
    phoneNumber: String(row.phone_number || row.phoneNumber || ''),
    vehicleName: String(row.vehicle_name || row.vehicleName || ''),
    location: String(row.location || ''),
    description: String(row.description || ''),
    services: serviceList,
    service: serviceList.join(', '),
    price: String(row.price || '0'),
    discount: String(row.discount || ''),
    email: String(row.email || ''),
    address: String(row.address || ''),
    billNo: String(row.bill_no || row.billNo || ''),
    status: String(row.status || 'pending'),
    createdBy: String(row.created_by || row.createdBy || ''),
    createdById: String(row.created_by_id || row.createdById || ''),
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
  };
}

// Convert JobRecord to DB snake_case row (strictly streamlined fields for Supabase)
export function mapJobRecordToRow(job: JobRecord): any {
  const serviceList = Array.isArray(job.services)
    ? job.services
    : typeof job.services === 'string' && job.services.trim()
    ? job.services.split(',').map((s) => s.trim())
    : job.service
    ? [job.service]
    : [];

  return {
    id: job.id,
    vehicle_number: job.vehicleNumber.trim().toUpperCase(),
    customer_name: job.customerName.trim(),
    phone_number: job.phoneNumber.trim(),
    vehicle_name: job.vehicleName || '',
    location: job.location || '',
    description: job.description || '',
    services: serviceList,
    price: job.price || '0',
    discount: job.discount || '',
    bill_no: job.billNo || '',
    status: job.status || 'pending',
    created_by: job.createdBy || '',
    created_by_id: job.createdById || '',
    created_at: job.createdAt,
  };
}

export function getAllJobRecords(): JobRecord[] {
  try {
    const jobsData = localStorage.getItem(JOBS_STORAGE_KEY);
    let jobs: JobRecord[] = jobsData ? JSON.parse(jobsData) : [];
    if (!Array.isArray(jobs)) jobs = [];
    return jobs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (e) {
    console.error('Failed to parse jobs from localStorage:', e);
    return [];
  }
}

export function getJobRecordById(id: string): JobRecord | undefined {
  return getAllJobRecords().find((j) => j.id === id);
}

// Asynchronously fetch all jobs from Supabase and sync local store
export async function syncJobsFromSupabase(): Promise<JobRecord[]> {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase fetch jobs error:', error.message);
      return getAllJobRecords();
    }

    if (data) {
      const mapped: JobRecord[] = data.map(mapRowToJobRecord);
      localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(mapped));
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(mapped));
      return mapped;
    }
  } catch (err) {
    console.error('❌ Supabase sync jobs exception:', err);
  }
  return getAllJobRecords();
}

export async function saveJobRecord(
  jobData: Omit<JobRecord, 'id' | 'createdAt'>
): Promise<JobRecord> {
  const isOwner = isOwnerAuthenticated();
  const currentStaff = getCurrentStaff();

  if (!isOwner && (!currentStaff || !currentStaff.active)) {
    throw new Error('Unauthorized: An active authenticated session is required to create job records.');
  }

  // Derive creator strictly from verified session, never trust arbitrary caller parameter
  const sessionCreatorName = isOwner ? 'Owner' : (currentStaff?.staff_name || 'Staff');
  const sessionCreatorId = isOwner ? 'owner' : (currentStaff?.id || 'staff');

  const existingJobs = getAllJobRecords();
  const newJob: JobRecord = {
    ...jobData,
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdBy: sessionCreatorName,
    createdById: sessionCreatorId,
    createdAt: new Date().toISOString(),
  };

  const updated = [newJob, ...existingJobs.filter((j) => j.id !== newJob.id)];
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(updated));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));

  // Sync to Supabase
  try {
    let row = mapJobRecordToRow(newJob);
    let { error } = await supabase.from('jobs').insert([row]);
    if (error && error.message && error.message.toLowerCase().includes('description')) {
      const { description, ...rowWithoutDesc } = row;
      const fallback = await supabase.from('jobs').insert([rowWithoutDesc]);
      error = fallback.error;
    }
    if (error) {
      console.error('❌ Supabase insert job error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase insert job exception:', err);
  }

  return newJob;
}

export async function updateJobRecord(
  id: string,
  updatedData: Partial<Omit<JobRecord, 'id' | 'createdAt'>>
): Promise<JobRecord | undefined> {
  const isOwner = isOwnerAuthenticated();
  const currentStaff = getCurrentStaff();

  if (!isOwner && (!currentStaff || !currentStaff.active)) {
    throw new Error('Unauthorized: An active authenticated session is required to update job records.');
  }

  const allJobs = getAllJobRecords();
  const target = allJobs.find((j) => j.id === id);
  if (!target) {
    throw new Error('Record not found.');
  }

  // Ownership Check: Only Owner or the Staff member who created the job can modify it
  if (!isOwner && target.createdById && target.createdById !== currentStaff?.id) {
    throw new Error('Forbidden: You do not have permission to modify this record. Only the creator or owner may edit.');
  }

  let targetJob: JobRecord | undefined;

  const updatedJobs = allJobs.map((j) => {
    if (j.id === id) {
      targetJob = {
        ...j,
        ...updatedData,
        // Preserve immutable creator metadata
        createdBy: j.createdBy,
        createdById: j.createdById,
        createdAt: j.createdAt,
      };
      return targetJob;
    }
    return j;
  });

  if (targetJob) {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(updatedJobs));
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedJobs));

    // Update in Supabase without duplicating
    try {
      let row = mapJobRecordToRow(targetJob);
      let { error } = await supabase
        .from('jobs')
        .update(row)
        .eq('id', id);
      if (error && error.message && error.message.toLowerCase().includes('description')) {
        const { description, ...rowWithoutDesc } = row;
        const fallback = await supabase
          .from('jobs')
          .update(rowWithoutDesc)
          .eq('id', id);
        error = fallback.error;
      }
      if (error) {
        console.error('❌ Supabase update job error:', error.message);
      }
    } catch (err) {
      console.error('❌ Supabase update job exception:', err);
    }
  }

  return targetJob;
}

export async function deleteJobRecord(id: string): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only an authenticated Owner can delete job records.');
  }

  const allJobs = getAllJobRecords();
  const target = allJobs.find((j) => j.id === id);
  if (!target) {
    throw new Error('Record not found.');
  }

  const { data, error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('❌ Supabase delete job error:', error.message);
    throw new Error(`Unable to delete vehicle record: ${error.message}`);
  }

  if (!data || data.length !== 1) {
    throw new Error('Unable to delete vehicle record: the selected record was not found or could not be deleted.');
  }

  const jobs = allJobs.filter((j) => j.id !== id);
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(jobs));
}

export async function restoreJobRecord(job: JobRecord): Promise<void> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only an authenticated Owner can restore job records.');
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert([mapJobRecordToRow(job)])
    .select('id')
    .single();

  if (error) {
    console.error('❌ Supabase restore job error:', error.message);
    throw new Error(`Unable to restore vehicle record: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Unable to restore vehicle record.');
  }

  const jobs = [job, ...getAllJobRecords().filter((existingJob) => existingJob.id !== job.id)];
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(jobs));
}

/**
 * Helper to get calendar date key in India timezone ("YYYY-MM-DD")
 */
export function getISTDateKey(dateInput?: string | number | Date): string {
  try {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
}

/**
 * Format a timestamp strictly as DD/MM/YYYY in India timezone (Asia/Kolkata)
 */
export function formatNumericDateIST(dateInput?: string | number | Date): string {
  try {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '-';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return typeof dateInput === 'string' ? dateInput : '-';
  }
}

export function getTodaysJobRecords(): JobRecord[] {
  const allJobs = getAllJobRecords();
  const currentTodayIST = getISTDateKey(new Date());

  return allJobs.filter((job) => {
    if (!job.createdAt) return false;
    const jobIST = getISTDateKey(job.createdAt);
    return jobIST === currentTodayIST;
  });
}
export function normalizeVehicleNumber(vehicleNumber: string): string {
  return (vehicleNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function lookupVehicleHistory(vehicleNumber: string): Promise<JobRecord | null> {
  const normalizedSearch = normalizeVehicleNumber(vehicleNumber);
  if (!normalizedSearch || normalizedSearch.length < 4) return null;

  try {
    // 1. Search local cached/saved job records first
    const allLocalJobs = getAllJobRecords();
    const localMatches = allLocalJobs.filter(
      (job) => normalizeVehicleNumber(job.vehicleNumber) === normalizedSearch
    );

    // 2. Query Supabase for matching records
    let supabaseMatches: JobRecord[] = [];
    try {
      const searchPattern = '%' + normalizedSearch.toLowerCase().split('').join('%') + '%';
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .ilike('vehicle_number', searchPattern)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        supabaseMatches = data
          .map(mapRowToJobRecord)
          .filter((job) => normalizeVehicleNumber(job.vehicleNumber) === normalizedSearch);
      }
    } catch (e) {
      console.warn('Supabase vehicle lookup query failed, falling back to local records:', e);
    }

    // 3. Merge and deduplicate by job ID, ordered newest first
    const mergedMap = new Map<string, JobRecord>();
    supabaseMatches.forEach((j) => mergedMap.set(j.id, j));
    localMatches.forEach((j) => mergedMap.set(j.id, j));

    const allMatches = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (allMatches.length === 0) return null;

    // The most recent overall job record (provides customerName, phoneNumber, vehicleName, location)
    const latestJob = allMatches[0];

    // Find the most recent job that contains a saved description
    const jobWithDesc = allMatches.find(
      (j) => typeof j.description === 'string' && j.description.trim().length > 0
    );

    return {
      ...latestJob,
      description: jobWithDesc?.description ? jobWithDesc.description.trim() : '',
    };
  } catch (err) {
    console.error('Vehicle lookup error:', err);
  }

  return null;
}
