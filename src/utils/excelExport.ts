import * as XLSX from 'xlsx';
import { getAllJobRecords, formatNumericDateIST, getISTDateKey, type JobRecord } from './draftStorage';

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

  const validDates: string[] = [];

  for (const record of records) {
    const key = getCustomerVehicleGroupKey(record);
    const timestamp = record.createdAt ? new Date(record.createdAt).getTime() : 0;
    const dateKey = getISTDateKey(record.createdAt);
    if (dateKey) validDates.push(dateKey);

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

  // Calculate export date range: YYYY-MM-DD - YYYY-MM-DD
  validDates.sort();
  const todayIST = getISTDateKey(new Date());
  const startDate = validDates.length > 0 ? validDates[0] : todayIST;
  const endDate = validDates.length > 0 ? validDates[validDates.length - 1] : todayIST;
  const dateRangeStr = `${startDate} - ${endDate}`;

  // 3. Sort unique rows by most recent visit date descending
  const sortedGroups = Array.from(groupedRecordsMap.values()).sort(
    (a, b) => b.latestTimestamp - a.latestTimestamp
  );

  // 4. Build 2D Sheet Data (AOA) with Header, Subtitle Date Range, and Table Columns
  const sheetAoa: any[][] = [
    ['GO GRAND DETAILING SERVICES: MURAKAMBATTU, ANDHRA PRADESH'],
    [dateRangeStr],
    [], // Clean empty line separating title from table
    [
      'Customer Name',
      'Mobile',
      'Registration Number',
      'Vehicle Model',
      'Last Visit',
      'Place',
      'No. of Visits',
    ],
  ];

  // 5. Append data rows
  sortedGroups.forEach((group) => {
    const r = group.latestRecord;
    const key = getCustomerVehicleGroupKey(r);
    const totalVisits = allTimeVisitCountMap.get(key) || group.allVisitsInSelection.length;

    sheetAoa.push([
      r.customerName || '-',
      r.phoneNumber || '-',
      (r.vehicleNumber || '-').toUpperCase(),
      r.vehicleName && r.vehicleName.trim() ? r.vehicleName.trim() : '-',
      formatNumericDateIST(r.createdAt),
      (r.location && r.location.trim()) || (r.address && r.address.trim()) || '-',
      totalVisits,
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(sheetAoa);

  // Merge Title and Subtitle across all 7 columns (A to G)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title row
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // Date range row
  ];

  // Professional column widths
  worksheet['!cols'] = [
    { wch: 24 }, // Customer Name
    { wch: 18 }, // Mobile
    { wch: 22 }, // Registration Number
    { wch: 20 }, // Vehicle Model
    { wch: 16 }, // Last Visit (DD/MM/YYYY)
    { wch: 22 }, // Place
    { wch: 16 }, // No. of Visits
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Summary');

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
