import * as XLSX from 'xlsx';
import { getAllJobRecords, formatNumericDateIST, type JobRecord } from './draftStorage';

/**
 * Normalizes vehicle registration number and customer phone to generate a unique customer+vehicle key.
 */
function getCustomerVehicleGroupKey(record: JobRecord): string {
  const cleanReg = (record.vehicleNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanPhone = (record.phoneNumber || '').trim().replace(/\D/g, '');
  const cleanName = (record.customerName || '').trim().toLowerCase();

  // Primary key: Normalized Vehicle Number + Normalized Phone (or Name fallback if phone empty)
  if (cleanReg && cleanPhone) {
    return `${cleanReg}__${cleanPhone}`;
  }
  if (cleanReg) {
    return `${cleanReg}__${cleanName}`;
  }
  return `${cleanPhone}__${cleanName}`;
}

export function exportJobsToExcel(records: JobRecord[], filename: string) {
  if (!records || records.length === 0) {
    alert('No vehicle records available to export.');
    return;
  }

  // 1. Calculate all-time historical visit counts for every customer+vehicle across the entire database
  const allHistoricalJobs = getAllJobRecords();
  const allTimeVisitCountMap = new Map<string, number>();

  for (const job of allHistoricalJobs) {
    const key = getCustomerVehicleGroupKey(job);
    allTimeVisitCountMap.set(key, (allTimeVisitCountMap.get(key) || 0) + 1);
  }

  // 2. Group the records to export so that each unique customer+vehicle combination appears as ONE row
  const groupedRecordsMap = new Map<
    string,
    {
      latestRecord: JobRecord;
      allVisitsInSelection: JobRecord[];
      latestTimestamp: number;
    }
  >();

  for (const record of records) {
    const key = getCustomerVehicleGroupKey(record);
    const timestamp = record.createdAt ? new Date(record.createdAt).getTime() : 0;

    if (!groupedRecordsMap.has(key)) {
      groupedRecordsMap.set(key, {
        latestRecord: record,
        allVisitsInSelection: [record],
        latestTimestamp: isNaN(timestamp) ? 0 : timestamp,
      });
    } else {
      const existing = groupedRecordsMap.get(key)!;
      existing.allVisitsInSelection.push(record);
      if (!isNaN(timestamp) && timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = timestamp;
        existing.latestRecord = record;
      }
    }
  }

  // 3. Sort unique rows by most recent visit date descending
  const sortedGroups = Array.from(groupedRecordsMap.values()).sort(
    (a, b) => b.latestTimestamp - a.latestTimestamp
  );

  // 4. Map to exact standard reference columns
  const dataRows = sortedGroups.map((group, index) => {
    const r = group.latestRecord;
    const key = getCustomerVehicleGroupKey(r);
    const totalVisits = allTimeVisitCountMap.get(key) || group.allVisitsInSelection.length;

    return {
      'S.No': index + 1,
      'Customer Name': r.customerName || '-',
      'Mobile': r.phoneNumber || '-',
      'Email': r.email && r.email.trim() ? r.email.trim() : '-',
      'Registration Number': (r.vehicleNumber || '-').toUpperCase(),
      'Vehicle Model': r.vehicleName && r.vehicleName.trim() ? r.vehicleName.trim() : '-',
      'Last Visit': formatNumericDateIST(r.createdAt),
      'Place': (r.location && r.location.trim()) || (r.address && r.address.trim()) || '-',
      'No. of Visits': totalVisits,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(dataRows);

  // Set professional column widths
  worksheet['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 22 }, // Customer Name
    { wch: 16 }, // Mobile
    { wch: 24 }, // Email
    { wch: 22 }, // Registration Number
    { wch: 20 }, // Vehicle Model
    { wch: 14 }, // Last Visit (DD/MM/YYYY)
    { wch: 18 }, // Place
    { wch: 14 }, // No. of Visits
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Summary');

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
