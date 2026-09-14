import * as XLSX from 'xlsx';
import type { JobRecord } from './draftStorage';

export function exportJobsToExcel(records: JobRecord[], filename: string) {
  if (!records || records.length === 0) {
    alert('No vehicle records available to export.');
    return;
  }

  const dataRows = records.map((record, index) => {
    let formattedDate = '';
    if (record.createdAt) {
      try {
        const d = new Date(record.createdAt);
        formattedDate = d.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        formattedDate = record.createdAt;
      }
    }

    let servicesStr = '';
    if (Array.isArray(record.services)) {
      servicesStr = record.services.length > 0 ? record.services.join(', ') : 'Standard Service';
    } else if (record.services) {
      servicesStr = String(record.services);
    } else if (record.service) {
      servicesStr = String(record.service);
    } else {
      servicesStr = 'Standard Service';
    }

    let priceStr = record.price || '';
    if (priceStr && !priceStr.startsWith('₹')) {
      const clean = priceStr.replace(/[^0-9.]/g, '');
      priceStr = clean ? `₹${clean}` : priceStr;
    }

    return {
      'S.No': index + 1,
      'Date & Time': formattedDate || '-',
      'Vehicle Number': record.vehicleNumber || '-',
      'Customer Name': record.customerName || '-',
      'Phone Number': record.phoneNumber || '-',
      'Vehicle Name': record.vehicleName || '-',
      'Location': record.location || '-',
      'Services': servicesStr,
      'Price': priceStr || '-',
      'Staff / Created By': record.createdBy || 'Staff',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(dataRows);

  // Set column widths for clean readability in Excel
  worksheet['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 22 }, // Date & Time
    { wch: 18 }, // Vehicle Number
    { wch: 22 }, // Customer Name
    { wch: 16 }, // Phone Number
    { wch: 16 }, // Vehicle Name
    { wch: 16 }, // Location
    { wch: 32 }, // Services
    { wch: 12 }, // Price
    { wch: 20 }, // Staff / Created By
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GO GRAND Records');

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
