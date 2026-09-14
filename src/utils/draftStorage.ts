import { supabase } from '../config/supabaseClient';

export interface JobRecord {
  id: string;
  vehicleNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleName?: string;
  location?: string;
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
  const existingJobs = getAllJobRecords();
  const newJob: JobRecord = {
    ...jobData,
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  const updated = [newJob, ...existingJobs.filter((j) => j.id !== newJob.id)];
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(updated));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));

  // Sync to Supabase
  try {
    const row = mapJobRecordToRow(newJob);
    const { error } = await supabase.from('jobs').insert([row]);
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
  const allJobs = getAllJobRecords();
  let targetJob: JobRecord | undefined;

  const updatedJobs = allJobs.map((j) => {
    if (j.id === id) {
      targetJob = {
        ...j,
        ...updatedData,
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
      const row = mapJobRecordToRow(targetJob);
      const { error } = await supabase
        .from('jobs')
        .update(row)
        .eq('id', id);
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
  const jobs = getAllJobRecords().filter((j) => j.id !== id);
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(jobs));

  // Delete from Supabase
  try {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) {
      console.error('❌ Supabase delete job error:', error.message);
    }
  } catch (err) {
    console.error('❌ Supabase delete job exception:', err);
  }
}

export function getTodaysJobRecords(): JobRecord[] {
  const allJobs = getAllJobRecords();
  const todayStr = new Date().toDateString();

  const todayJobs = allJobs.filter((job) => {
    if (!job.createdAt) return true;
    const jobDate = new Date(job.createdAt).toDateString();
    return jobDate === todayStr;
  });

  return todayJobs.length > 0 ? todayJobs : allJobs;
}
