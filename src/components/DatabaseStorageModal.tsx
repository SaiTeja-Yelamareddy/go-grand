import React, { useState, useEffect } from 'react';
import { X, Database, HardDrive, ShieldCheck, AlertTriangle, Cloud, CheckCircle, RefreshCw } from 'lucide-react';
import { getWhatsAppBackendUrl } from '../config/apiConfig';
import { isSupabaseConfigured, supabase } from '../config/supabaseClient';

interface DatabaseStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DatabaseUsageData {
  success: boolean;
  timestamp: string;
  storage: {
    estimatedBytes: number;
    usedMb: number;
    limitMb: number;
    percentageUsed: number;
    status: 'HEALTHY' | 'WARNING' | 'STRONG_WARNING' | 'CRITICAL';
    warningMessage: string;
  };
  tableMetrics: {
    jobs: number;
    staffProfiles: number;
    activeStaffProfiles: number;
    serviceSections: number;
    totalServices: number;
    appSettings: number;
    whatsappAuthRecords: number;
  };
  projection5Years: {
    assumedJobsPerDay: number;
    projectedTotalJobs: number;
    projectedSizeMb: number;
    projectedPercentage: number;
    fitsInFreeTier: boolean;
  };
  backup: {
    lastSuccessfulAt: string | null;
    lastSuccessfulFilename: string | null;
    successfulBackupCount: number;
    googleDriveConfigured: boolean;
    googleDriveSuccessfulCount: number;
    googleDriveLastSuccessfulAt: string | null;
    status: string;
  };
}

export const DatabaseStorageModal: React.FC<DatabaseStorageModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<DatabaseUsageData | null>(null);
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [backupResult, setBackupResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobsCount, setJobsCount] = useState<number | null>(null);
  const [jobsCountLoading, setJobsCountLoading] = useState<boolean>(false);
  const [jobsCountError, setJobsCountError] = useState<boolean>(false);

  const fetchJobsCount = async () => {
    setJobsCountLoading(true);
    setJobsCountError(false);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase database connection is not configured.');
      }

      const { count, error: jobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true });

      if (jobsError) {
        throw jobsError;
      }

      if (count === null) {
        throw new Error('Supabase did not return an exact jobs count.');
      }

      setJobsCount(count);
    } catch (err: any) {
      console.warn('Live jobs count fetch error:', err.message);
      setJobsCount(null);
      setJobsCountError(true);
    } finally {
      setJobsCountLoading(false);
    }
  };

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    const backendUrl = getWhatsAppBackendUrl();

    try {
      const res = await fetch(`${backendUrl}/api/database/usage`, {
        headers: {
          'x-user-role': 'OWNER',
        },
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || 'Failed to load database usage metrics.');
      }
    } catch (err: any) {
      console.warn('Database metrics fetch error:', err.message);
      setData(null);
      setError('Live database metrics are currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetrics();
      fetchJobsCount();
      setBackupResult(null);
    }
  }, [isOpen]);

  const handleTriggerBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    const backendUrl = getWhatsAppBackendUrl();

    try {
      const res = await fetch(`${backendUrl}/api/database/backup`, {
        method: 'POST',
        headers: {
          'x-user-role': 'OWNER',
        },
      });

      const json = await res.json();
      setBackupResult(json);
      // Refresh metrics after backup
      fetchMetrics();
      fetchJobsCount();
    } catch (err: any) {
      setBackupResult({
        success: false,
        error: err.message || 'Backup trigger failed',
      });
    } finally {
      setBackupLoading(false);
    }
  };

  if (!isOpen) return null;

  const storage = data?.storage;

  const statusColor =
    storage?.status === 'CRITICAL'
      ? 'text-red-600 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700'
      : storage?.status === 'STRONG_WARNING'
      ? 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700'
      : storage?.status === 'WARNING'
      ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
      : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Database Storage & Backup"
    >
      <div className="bg-white dark:bg-[#121212] border border-[#E5E5E5] dark:border-[#262626] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between bg-[#FAFAFA] dark:bg-[#181818]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#111111] dark:text-white uppercase tracking-wider">
                Database & Cloud Backup
              </h2>
              <p className="text-[11px] font-bold text-[#666666] dark:text-neutral-400">
                Supabase Free Tier (500 MB) Optimization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#666666] dark:text-neutral-400 hover:text-black dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-sm">
          {error && (
            <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Main Storage Status Card */}
          {storage && <div className="p-4 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#181818] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#666666] dark:text-neutral-400">
                Current Storage Usage
              </span>
              <span className={`px-2.5 py-0.5 text-[11px] font-black uppercase rounded-full border ${statusColor}`}>
                {storage.status}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#111111] dark:text-white">
                {storage.usedMb} MB
              </span>
              <span className="text-xs font-bold text-[#666666] dark:text-neutral-400">
                Limit: {storage.limitMb} MB ({storage.percentageUsed}% Used)
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-[#E5E5E5] dark:bg-[#2A2A2A] rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  storage.percentageUsed >= 90
                    ? 'bg-red-600'
                    : storage.percentageUsed >= 80
                    ? 'bg-orange-500'
                    : storage.percentageUsed >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(2, Math.min(100, storage.percentageUsed))}%` }}
              />
            </div>

            {storage && storage.status !== 'HEALTHY' && (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{storage.warningMessage}</span>
              </div>
            )}
          </div>}

          {/* 5-Year Workload Projection */}
          {data?.projection5Years && (
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>5-Year Storage Projection (20 Jobs/Day)</span>
              </div>
              <p className="text-xs text-indigo-950 dark:text-neutral-300 leading-relaxed">
                At maximum workload (~36,500 total jobs over 5 years), estimated database storage is only{' '}
                <strong className="font-bold text-indigo-700 dark:text-indigo-300">
                  {data.projection5Years.projectedSizeMb} MB (~{data.projection5Years.projectedPercentage}% of Free limit)
                </strong>
                . 5+ years of live customer and vehicle history will easily remain accessible on the Supabase Free plan.
              </p>
            </div>
          )}

          {/* Table Counts */}
          {data?.tableMetrics && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#181818]">
                <p className="text-[11px] font-bold text-[#666666] dark:text-neutral-400 uppercase">Jobs / Visits</p>
                <p className="text-lg font-black text-[#111111] dark:text-white">
                  {jobsCountLoading ? 'Loading...' : jobsCountError || jobsCount === null ? 'Unable to load record count' : `${jobsCount.toLocaleString()} ${jobsCount === 1 ? 'record' : 'records'}`}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#181818]">
                <p className="text-[11px] font-bold text-[#666666] dark:text-neutral-400 uppercase">Staff Accounts</p>
                <p className="text-lg font-black text-[#111111] dark:text-white">
                  {data.tableMetrics.activeStaffProfiles} active / {data.tableMetrics.staffProfiles} total
                </p>
              </div>
              <div className="p-3 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#181818]">
                <p className="text-[11px] font-bold text-[#666666] dark:text-neutral-400 uppercase">Service Sections</p>
                <p className="text-lg font-black text-[#111111] dark:text-white">{data.tableMetrics.serviceSections}</p>
              </div>
              <div className="p-3 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#181818]">
                <p className="text-[11px] font-bold text-[#666666] dark:text-neutral-400 uppercase">Services</p>
                <p className="text-lg font-black text-[#111111] dark:text-white">{data.tableMetrics.totalServices}</p>
              </div>
            </div>
          )}

          {/* Disaster Recovery Backup Section */}
          <div className="p-4 rounded-xl border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#181818] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-black uppercase tracking-wider text-[#111111] dark:text-white">
                  Automated Cloud Backup
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Daily 02:00 AM UTC
              </span>
            </div>

            <p className="text-xs text-[#666666] dark:text-neutral-400 leading-normal">
              Creates full timestamped PostgreSQL SQL dumps with SHA-256 verification and uploads to Google Drive with 30-day retention.
            </p>
            {data?.backup && (
              <div className="text-xs text-[#666666] dark:text-neutral-400 space-y-1">
                <p>Last successful local backup: {data.backup.lastSuccessfulAt ? new Date(data.backup.lastSuccessfulAt).toLocaleString() : 'None recorded'}</p>
                <p>Successful backups: {data.backup.successfulBackupCount}</p>
                <p>
                  Google Drive:{' '}
                  {data.backup.googleDriveSuccessfulCount > 0
                    ? `Uploaded (${data.backup.googleDriveSuccessfulCount} successful)`
                    : data.backup.googleDriveConfigured
                    ? 'Configured, no confirmed upload'
                    : 'Not configured'}
                </p>
              </div>
            )}

            <button
              onClick={handleTriggerBackup}
              disabled={backupLoading}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#111111] dark:bg-white text-white dark:text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {backupLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Database Backup...</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  <span>Trigger Instant Database Backup</span>
                </>
              )}
            </button>

            {backupResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  backupResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-300 border-red-300 dark:border-red-800'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {backupResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  <span>
                    {backupResult.success
                      ? backupResult.googleDrive?.uploaded
                        ? 'Backup Created and Uploaded to Google Drive'
                        : 'Backup Generated Locally; Google Drive Upload Not Confirmed'
                      : 'Backup Failed'}
                  </span>
                </div>
                {backupResult.filename && (
                  <p className="text-[11px] font-mono break-all">File: {backupResult.filename} ({backupResult.sizeKb} KB)</p>
                )}
                {backupResult.checksumSha256 && (
                  <p className="text-[10px] font-mono opacity-80 break-all">
                    SHA-256: {backupResult.checksumSha256.substring(0, 32)}...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#E5E5E5] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#181818] flex items-center justify-between">
          <button
            onClick={() => {
              fetchMetrics();
              fetchJobsCount();
            }}
            disabled={loading || jobsCountLoading}
            className="px-3 py-1.5 text-xs font-bold text-[#666666] dark:text-neutral-400 hover:text-black dark:hover:text-white flex items-center gap-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#E5E5E5] dark:bg-[#262626] text-[#111111] dark:text-white text-xs font-bold uppercase tracking-wider hover:bg-[#D4D4D4] dark:hover:bg-[#333333] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
