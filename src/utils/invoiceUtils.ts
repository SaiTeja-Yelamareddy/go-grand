import { type JobRecord } from './draftStorage';
import { getStoredUpiId } from './upiStorage';
import { getWhatsAppBackendUrl } from '../config/apiConfig';

/**
 * Generates a consistent sequential bill number from ID/timestamp
 */
export function generateBillNo(id?: string, createdAt?: string): string {
  if (id && id.includes('_')) {
    const parts = id.split('_');
    const last = parts[parts.length - 1];
    return `GG-${last.slice(-5).toUpperCase()}`;
  }
  const dateObj = createdAt ? new Date(createdAt) : new Date();
  const year = dateObj.getFullYear().toString().slice(-2);
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `GG-${year}${month}-${randomSuffix}`;
}

/**
 * Normalizes price strings (e.g. "₹500", "500", "500.00") into numeric value
 */
export function parsePriceNumber(priceStr?: string | number): number {
  if (!priceStr) return 0;
  if (typeof priceStr === 'number') return priceStr;
  const clean = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

/**
 * Converts numbers into Indian Rupees words string
 */
export function numberToWordsRupees(num: number): string {
  if (num === 0) return 'Zero Rupees Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 10) return units[n];
    if (n >= 10 && n < 20) return teens[n - 10];
    const unit = n % 10;
    return `${tens[Math.floor(n / 10)]} ${unit ? units[unit] : ''}`.trim();
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    const hundredStr = hundred ? `${units[hundred]} Hundred ` : '';
    const remStr = remainder ? convertTwoDigits(remainder) : '';
    return `${hundredStr}${remStr}`.trim();
  }

  const rounded = Math.floor(num);
  let str = '';

  const crore = Math.floor(rounded / 10000000);
  let rem = rounded % 10000000;

  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;

  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  if (crore) str += `${convertTwoDigits(crore)} Crore `;
  if (lakh) str += `${convertTwoDigits(lakh)} Lakh `;
  if (thousand) str += `${convertTwoDigits(thousand)} Thousand `;
  if (rem) str += `${convertThreeDigits(rem)} `;

  return `${str.trim()} Rupees Only`;
}

/**
 * Formats a clean currency string with ₹ symbol and two decimals
 */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatWhatsAppBillText(record: JobRecord): string {
  const priceNum = parsePriceNumber(record.price);
  const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
  const total = Math.max(0, priceNum - discountNum);

  const servicesText = Array.isArray(record.services)
    ? record.services.join(', ')
    : record.services || record.service || 'Car Wash & Detailing';

  const billNo = record.billNo || generateBillNo(record.id, record.createdAt);
  const dateStr = record.createdAt ? new Date(record.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  return (
    `🚗 *GO GRAND CAR WASH & DETAILING*\n` +
    `📍 Near RTO Office, Murakambattu, Chittoor\n` +
    `📞 +91 80081 95435\n\n` +
    `🧾 *TAX INVOICE / BILL*\n` +
    `---------------------------\n` +
    `*Invoice No:* ${billNo}\n` +
    `*Date:* ${dateStr}\n` +
    `*Customer:* ${record.customerName || 'Valued Customer'}\n` +
    `*Vehicle No:* ${(record.vehicleNumber || '').toUpperCase()}\n` +
    `*Vehicle:* ${record.vehicleName || 'Vehicle'}\n` +
    `*Staff:* ${record.createdBy || 'Owner'}\n` +
    `---------------------------\n` +
    `*Services:* ${servicesText}\n` +
    `*Subtotal:* ${formatCurrency(priceNum)}\n` +
    (discountNum > 0 ? `*Discount:* -${formatCurrency(discountNum)}\n` : '') +
    `*Total Paid:* *${formatCurrency(total)}*\n` +
    `---------------------------\n\n` +
    `Thank you for your visit! Have a safe drive! 🚗✨`
  );
}

export function formatWhatsAppPdfCaption(record: JobRecord): string {
  const priceNum = parsePriceNumber(record.price);
  const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
  const total = Math.max(0, priceNum - discountNum);

  return (
    `🚗 *GO GRAND TAX INVOICE*\n` +
    `Vehicle: ${(record.vehicleNumber || '').toUpperCase()} (${record.vehicleName || 'Vehicle'})\n` +
    `Total Amount: *${formatCurrency(total)}*\n\n` +
    `Thank you for choosing GO GRAND Car Wash & Detailing! ✨`
  );
}

export function openWhatsAppDirect(record: JobRecord) {
  const cleanPhone = record.phoneNumber.replace(/\D/g, '');
  const message = formatWhatsAppBillText(record);
  const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

export async function sendWhatsAppBillViaBackend(record: JobRecord): Promise<{ success: boolean; method: 'backend'; error?: string }> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    console.log(`[WHATSAPP HEALTH] GET ${backendUrl}/api/whatsapp/status`);
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          method: 'backend',
          error: 'WhatsApp is not connected. Scan QR code in WhatsApp Settings to link your phone.',
        };
      }

      const fullTextMessage = formatWhatsAppBillText(record);
      const pdfCaptionMessage = formatWhatsAppPdfCaption(record);
      
      // Try sending PDF invoice document with clean short caption
      const pdfSendRes = await fetch(`${backendUrl}/api/whatsapp/send-invoice-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: record,
          phoneNumber: record.phoneNumber,
          textMessage: pdfCaptionMessage,
        }),
      });

      if (pdfSendRes.ok) {
        const pdfData = await pdfSendRes.json();
        if (pdfData.success) {
          return { success: true, method: 'backend' };
        }
      }

      // Fallback to text message send if PDF endpoint encountered issue
      const sendRes = await fetch(`${backendUrl}/api/whatsapp/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: record.phoneNumber,
          message: fullTextMessage,
        }),
      });

      if (sendRes.ok) {
        const sendData = await sendRes.json();
        if (sendData.success) {
          return { success: true, method: 'backend' };
        }
      }
    }
  } catch (err: any) {
    console.error('WhatsApp backend send failed:', err);
    return { success: false, method: 'backend', error: err?.message || 'WhatsApp server error' };
  }

  return { success: false, method: 'backend', error: 'WhatsApp server is offline or unreachable' };
}

export async function sendWhatsAppMessageViaBackend(phoneNumber: string, message: string): Promise<{ success: boolean; method: 'backend'; error?: string }> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    console.log(`[WHATSAPP HEALTH] GET ${backendUrl}/api/whatsapp/status`);
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          method: 'backend',
          error: 'WhatsApp is not connected. Scan QR code in WhatsApp Settings to link your phone.',
        };
      }

      const sendRes = await fetch(`${backendUrl}/api/whatsapp/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          message,
        }),
      });
      if (sendRes.ok) {
        const sendData = await sendRes.json();
        if (sendData.success) {
          return { success: true, method: 'backend' };
        }
      }
    }
  } catch (err: any) {
    console.error('WhatsApp backend send failed:', err);
    return { success: false, method: 'backend', error: err?.message || 'WhatsApp server error' };
  }

  return { success: false, method: 'backend', error: 'WhatsApp server is offline or unreachable' };
}

export function formatVehicleReadyMessage(
  customerName?: string,
  vehicleName?: string,
  vehicleNumber?: string,
  amount?: string | number
): string {
  const custName = customerName || 'Valued Customer';
  const vehName = vehicleName || 'Vehicle';
  const vehNo = (vehicleNumber || 'CAR').toUpperCase();

  let amtStr = '0';
  if (typeof amount === 'number') {
    amtStr = amount.toString();
  } else if (typeof amount === 'string' && amount.trim()) {
    amtStr = amount.replace(/[^0-9.]/g, '') || '0';
  }

  return (
    `🚗 *VEHICLE READY!*\n\n` +
    `Hello ${custName} 👋\n\n` +
    `Your ${vehName} (${vehNo}) is ready for pickup at *GO GRAND Car Wash & Detailing, Murakambattu*.\n\n` +
    `🏪 *GO GRAND Car Wash & Detailing*\n` +
    `💰 *Amount: ₹${amtStr}*\n\n` +
    `Please scan the QR below to complete the payment.\n\n` +
    `👉 *Scan to Pay*`
  );
}

export async function sendVehicleReadyWhatsAppViaBackend(record: JobRecord): Promise<{ success: boolean; method: 'backend'; error?: string }> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    console.log(`[WHATSAPP HEALTH] GET ${backendUrl}/api/whatsapp/status`);
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          method: 'backend',
          error: 'WhatsApp is not connected. Scan QR code in WhatsApp Settings to link your phone.',
        };
      }

      // Calculate final invoice amount
      const priceNum = parsePriceNumber(record.price);
      const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
      const finalAmount = Math.max(0, priceNum - discountNum);

      const upiId = getStoredUpiId();
      const msg = formatVehicleReadyMessage(
        record.customerName,
        record.vehicleName,
        record.vehicleNumber,
        finalAmount
      );

      // Call dedicated Vehicle Ready endpoint with UPI QR image generation
      const sendRes = await fetch(`${backendUrl}/api/whatsapp/send-vehicle-ready-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: record,
          phoneNumber: record.phoneNumber,
          upiId: upiId,
          textMessage: msg,
        }),
      });

      if (sendRes.ok) {
        const sendData = await sendRes.json();
        if (sendData.success) {
          return { success: true, method: 'backend' };
        }
      }
    }
  } catch (err: any) {
    console.error('Vehicle ready send failed:', err);
    return { success: false, method: 'backend', error: err?.message || 'WhatsApp server error' };
  }

  return { success: false, method: 'backend', error: 'WhatsApp server is offline or unreachable' };
}

export function formatVehicleReceivedMessage(
  customerName?: string,
  vehicleName?: string,
  vehicleNumber?: string,
  services?: string[] | string
): string {
  const custName = customerName || 'Valued Customer';
  const vehName = vehicleName || 'Vehicle';
  const vehNo = (vehicleNumber || 'CAR').toUpperCase();
  const servicesText = Array.isArray(services)
    ? services.join(', ')
    : services || 'Car Wash';

  return (
    `🚗 *VEHICLE RECEIVED!*\n\n` +
    `Hello ${custName} 👋\n\n` +
    `We have received your ${vehName} (${vehNo}) for *${servicesText}* at *GO GRAND Car Wash & Detailing, Murakambattu*.\n\n` +
    `Our team has started working on your vehicle with utmost care. We will notify you once your vehicle is clean and ready for pickup!\n\n` +
    `📞 *Helpline:* +91 80081 95435`
  );
}

export async function sendVehicleReceivedWhatsAppViaBackend(record: JobRecord): Promise<{ success: boolean; method: 'backend'; error?: string }> {
  const msg = formatVehicleReceivedMessage(
    record.customerName,
    record.vehicleName,
    record.vehicleNumber,
    record.services || record.service
  );
  return sendWhatsAppMessageViaBackend(record.phoneNumber, msg);
}
