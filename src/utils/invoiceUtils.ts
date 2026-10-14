import { type JobRecord } from './draftStorage';
import { getStoredUpiId, getUpiEnabled } from './upiStorage';
import { getWhatsAppBackendUrl } from '../config/apiConfig';
import {
  getMessageTemplates,
  renderTemplate,
  formatMessageDateIST,
  formatMessageTimeIST,
  SHOP_NAME,
  getSendPdfWithMessage,
} from './templateStorage';

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

  const templates = getMessageTemplates();
  return renderTemplate(templates.whatsAppBill, {
    customer_name: record.customerName,
    vehicle_model: record.vehicleName,
    vehicle_number: record.vehicleNumber,
    service: servicesText,
    amount: total,
    bill_no: billNo,
    shop_name: SHOP_NAME,
    date: formatMessageDateIST(new Date()),
    time: formatMessageTimeIST(new Date()),
  });
}

export function formatWhatsAppPdfCaption(record: JobRecord): string {
  return formatWhatsAppBillText(record);
}

export function openWhatsAppDirect(record: JobRecord) {
  const cleanPhone = record.phoneNumber.replace(/\D/g, '');
  const message = formatWhatsAppBillText(record);
  const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

export type WhatsAppSendStatus = 'sent' | 'failed' | 'unconfirmed' | 'disconnected';

export interface WhatsAppSendResult {
  success: boolean;
  status: WhatsAppSendStatus;
  method: 'backend';
  messageId?: string;
  error?: string;
}

async function safeWhatsAppFetch(
  url: string,
  options: RequestInit,
  timeoutMs = 18000
): Promise<{ ok: boolean; status: number; data?: any; timedOut?: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout =
      err?.name === 'AbortError' ||
      String(err).includes('abort') ||
      String(err).includes('timeout');
    return { ok: false, status: isTimeout ? 408 : 0, timedOut: isTimeout };
  }
}

function interpretSendResponse(fetchResult: {
  ok: boolean;
  status: number;
  data?: any;
  timedOut?: boolean;
}): WhatsAppSendResult {
  if (fetchResult.timedOut) {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error: 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  const { ok, status, data } = fetchResult;

  // 1. Explicit disconnected detection
  if (
    status === 503 ||
    data?.status === 'disconnected' ||
    data?.whatsappConnected === false
  ) {
    return {
      success: false,
      status: 'disconnected',
      method: 'backend',
      error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
    };
  }

  // 2. Successful send: Only when backend confirms WhatsApp accepted message
  if (ok && data?.success && (data?.status === 'sent' || data?.messageId)) {
    return {
      success: true,
      status: 'sent',
      method: 'backend',
      messageId: data.messageId,
    };
  }

  // 3. Ambiguous / unconfirmed outcome (e.g. unknown status or queued)
  if (data?.status === 'unconfirmed' || data?.status === 'unknown') {
    return {
      success: false,
      status: 'unconfirmed',
      method: 'backend',
      error:
        data?.error ||
        'WhatsApp has not confirmed delivery. Check the message status before retrying.',
    };
  }

  // 4. Definite failure
  return {
    success: false,
    status: 'failed',
    method: 'backend',
    error: data?.error || 'Your WhatsApp message could not be sent. Please try again.',
  };
}

export async function sendWhatsAppBillViaBackend(
  record: JobRecord,
  options?: { sendPdf?: boolean }
): Promise<WhatsAppSendResult> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          status: 'disconnected',
          method: 'backend',
          error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
        };
      }
    }

    const fullTextMessage = formatWhatsAppBillText(record);
    const idempotencyKey = record.id ? `bill_${record.id}_${Date.now()}` : undefined;
    const shouldSendPdf = options?.sendPdf !== undefined ? options.sendPdf : getSendPdfWithMessage();

    if (shouldSendPdf) {
      const pdfCaptionMessage = formatWhatsAppPdfCaption(record);
      const pdfSendRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-invoice-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: record,
          phoneNumber: record.phoneNumber,
          textMessage: pdfCaptionMessage,
          idempotencyKey,
        }),
      });

      const interpretedPdf = interpretSendResponse(pdfSendRes);
      if (interpretedPdf.success) {
        return interpretedPdf;
      }

      // If sendPdf was explicitly requested (e.g. from vehicle three-dot menu), do not fall back to text-only send
      if (options?.sendPdf === true) {
        return interpretedPdf;
      }

      // If disconnected or unconfirmed, return immediately without duplicate attempt
      if (interpretedPdf.status === 'disconnected' || interpretedPdf.status === 'unconfirmed') {
        return interpretedPdf;
      }

      // Fallback to text message send if PDF endpoint encountered issue
      const textSendRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: record.phoneNumber,
          message: fullTextMessage,
          idempotencyKey,
        }),
      });
      return interpretSendResponse(textSendRes);
    } else {
      const textSendRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: record.phoneNumber,
          message: fullTextMessage,
          idempotencyKey,
        }),
      });
      return interpretSendResponse(textSendRes);
    }
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: 'Your WhatsApp message could not be sent. Please try again.',
    };
  }
}

/**
 * Directly sends the existing invoice PDF via WhatsApp backend without checking toggle settings.
 * Always sends exactly ONE invoice PDF document to the customer's WhatsApp number.
 */
export async function sendWhatsAppInvoicePdfViaBackend(
  record: JobRecord
): Promise<WhatsAppSendResult> {
  return sendWhatsAppBillViaBackend(record, { sendPdf: true });
}

export async function sendWhatsAppMessageViaBackend(
  phoneNumber: string,
  message: string,
  idempotencyKey?: string
): Promise<WhatsAppSendResult> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          status: 'disconnected',
          method: 'backend',
          error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
        };
      }
    }

    const sendRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        message,
        idempotencyKey,
      }),
    });
    return interpretSendResponse(sendRes);
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: 'Your WhatsApp message could not be sent. Please try again.',
    };
  }
}

export function formatVehicleReadyMessage(
  customerName?: string,
  vehicleName?: string,
  vehicleNumber?: string,
  amount?: string | number,
  services?: string[] | string,
  billNo?: string,
  sendDate?: Date | string | number
): string {
  const servicesText = Array.isArray(services)
    ? services.join(', ')
    : services || 'Car Wash & Detailing';

  const templates = getMessageTemplates();
  return renderTemplate(templates.vehicleReady, {
    customer_name: customerName,
    vehicle_model: vehicleName,
    vehicle_number: vehicleNumber,
    amount: amount,
    service: servicesText,
    bill_no: billNo,
    shop_name: SHOP_NAME,
    date: formatMessageDateIST(sendDate || new Date()),
    time: formatMessageTimeIST(sendDate || new Date()),
  });
}

export async function sendVehicleReadyWhatsAppViaBackend(
  record: JobRecord
): Promise<WhatsAppSendResult> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          status: 'disconnected',
          method: 'backend',
          error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
        };
      }
    }

    // Calculate final invoice amount
    const priceNum = parsePriceNumber(record.price);
    const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
    const finalAmount = Math.max(0, priceNum - discountNum);
    const billNo = record.billNo || generateBillNo(record.id, record.createdAt);

    const upiId = getUpiEnabled() ? getStoredUpiId() : '';
    const msg = formatVehicleReadyMessage(
      record.customerName,
      record.vehicleName,
      record.vehicleNumber,
      finalAmount,
      record.services || record.service,
      billNo,
      new Date()
    );

    const idempotencyKey = record.id ? `ready_${record.id}_${Date.now()}` : undefined;

    // Call dedicated Vehicle Ready endpoint with UPI QR image generation
    const sendRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-vehicle-ready-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: record,
        phoneNumber: record.phoneNumber,
        upiId: upiId,
        textMessage: msg,
        idempotencyKey,
      }),
    });

    return interpretSendResponse(sendRes);
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: 'Your WhatsApp message could not be sent. Please try again.',
    };
  }
}

export function formatVehicleReceivedMessage(
  customerName?: string,
  vehicleName?: string,
  vehicleNumber?: string,
  services?: string[] | string,
  amount?: string | number,
  billNo?: string,
  receivedAt?: Date | string | number
): string {
  const servicesText = Array.isArray(services)
    ? services.join(', ')
    : services || 'Car Wash & Detailing';

  const templates = getMessageTemplates();
  return renderTemplate(templates.vehicleReceived, {
    customer_name: customerName,
    vehicle_model: vehicleName,
    vehicle_number: vehicleNumber,
    service: servicesText,
    amount: amount,
    bill_no: billNo,
    shop_name: SHOP_NAME,
    date: formatMessageDateIST(receivedAt || new Date()),
    time: formatMessageTimeIST(receivedAt || new Date()),
  });
}

export async function sendVehicleReceivedWhatsAppViaBackend(
  record: JobRecord
): Promise<WhatsAppSendResult> {
  const priceNum = parsePriceNumber(record.price);
  const discountNum = record.discount ? parsePriceNumber(record.discount) : 0;
  const finalAmount = Math.max(0, priceNum - discountNum);
  const billNo = record.billNo || generateBillNo(record.id, record.createdAt);

  const msg = formatVehicleReceivedMessage(
    record.customerName,
    record.vehicleName,
    record.vehicleNumber,
    record.services || record.service,
    finalAmount,
    billNo,
    record.createdAt || new Date()
  );
  const idempotencyKey = record.id ? `recv_${record.id}_${Date.now()}` : undefined;
  return sendWhatsAppMessageViaBackend(record.phoneNumber, msg, idempotencyKey);
}

/**
 * Formats a promotional WhatsApp message using the configured promotional template.
 * [Date] and [Time] represent the actual send timestamp in Asia/Kolkata timezone.
 */
export function formatPromotionalMessage(
  customerName?: string,
  vehicleName?: string,
  vehicleNumber?: string,
  services?: string[] | string,
  amount?: string | number,
  billNo?: string,
  sendDate?: Date | string | number
): string {
  const servicesText = Array.isArray(services)
    ? services.join(', ')
    : services || 'Car Wash & Detailing';

  const templates = getMessageTemplates();
  return renderTemplate(templates.promotional, {
    customer_name: customerName,
    vehicle_model: vehicleName,
    vehicle_number: vehicleNumber,
    service: servicesText,
    amount: amount,
    bill_no: billNo,
    shop_name: SHOP_NAME,
    date: formatMessageDateIST(sendDate || new Date()),
    time: formatMessageTimeIST(sendDate || new Date()),
  });
}

/**
 * Sends a promotional WhatsApp message via the backend.
 */
export async function sendPromotionalWhatsAppViaBackend(
  phoneNumber: string,
  message: string,
  job?: JobRecord,
  idempotencyKey?: string
): Promise<WhatsAppSendResult> {
  const backendUrl = getWhatsAppBackendUrl();
  try {
    const statusRes = await fetch(`${backendUrl}/api/whatsapp/status`).catch(() => null);
    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        return {
          success: false,
          status: 'disconnected',
          method: 'backend',
          error: 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
        };
      }
    }

    const promoRes = await safeWhatsAppFetch(`${backendUrl}/api/whatsapp/send-promotional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        message,
        customerName: job?.customerName,
        vehicleNumber: job?.vehicleNumber,
        jobId: job?.id,
        idempotencyKey,
      }),
    });

    return interpretSendResponse(promoRes);
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      method: 'backend',
      error: 'Your WhatsApp message could not be sent. Please try again.',
    };
  }
}

