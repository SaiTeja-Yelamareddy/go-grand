import { supabase, isSupabaseConfigured } from '../config/supabaseClient';
import { isOwnerAuthenticated } from '../config/authConfig';

export interface MessageTemplates {
  vehicleReceived: string;
  vehicleReady: string;
  whatsAppBill: string;
  sms: string;
}

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  vehicleReceived:
    'Hello {{customer_name}}, your {{vehicle_model}} ({{vehicle_number}}) has been received at {{shop_name}}. We will notify you when your vehicle is ready.',
  vehicleReady:
    'Hello {{customer_name}}, your {{vehicle_model}} ({{vehicle_number}}) is ready for pickup at {{shop_name}}. Thank you for choosing us.',
  whatsAppBill:
    'Hello {{customer_name}}, your bill for {{vehicle_model}} ({{vehicle_number}}) from {{shop_name}} is ₹{{amount}}. Please find your invoice attached.',
  sms:
    '{{shop_name}}: Your {{vehicle_model}} ({{vehicle_number}}) is ready for pickup. Amount: ₹{{amount}}.',
};

export const TEMPLATE_STORAGE_KEY = 'go-grand-message-templates';
export const SHOP_NAME = 'GO GRAND Car Wash & Detailing';

export interface TemplateVariables {
  customer_name?: string;
  vehicle_number?: string;
  vehicle_model?: string;
  service?: string;
  amount?: string | number;
  bill_no?: string;
  shop_name?: string;
}

/**
 * Centralized placeholder replacement function.
 * Safely replaces all supported placeholders with provided values or fallback defaults.
 * Never leaves raw {{placeholder}} in the output message.
 */
export function renderTemplate(template: string, vars: TemplateVariables): string {
  if (!template || typeof template !== 'string') return '';

  const shopName = vars.shop_name?.trim() || SHOP_NAME;
  const customerName = vars.customer_name?.trim() || 'Valued Customer';
  const vehicleNumber = vars.vehicle_number?.trim()
    ? vars.vehicle_number.trim().toUpperCase()
    : 'Vehicle';
  const vehicleModel = vars.vehicle_model?.trim() || 'Vehicle';
  const service = vars.service?.trim() || 'Car Wash & Detailing';

  let amtStr = '0';
  if (typeof vars.amount === 'number') {
    amtStr = vars.amount.toLocaleString('en-IN');
  } else if (typeof vars.amount === 'string' && vars.amount.trim()) {
    const clean = vars.amount.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(clean);
    amtStr = !isNaN(parsed) ? parsed.toLocaleString('en-IN') : vars.amount.trim();
  }

  const billNo = vars.bill_no?.trim() || '';

  return template
    .replace(/\{\{\s*customer_name\s*\}\}/gi, customerName)
    .replace(/\{\{\s*vehicle_number\s*\}\}/gi, vehicleNumber)
    .replace(/\{\{\s*vehicle_model\s*\}\}/gi, vehicleModel)
    .replace(/\{\{\s*service\s*\}\}/gi, service)
    .replace(/\{\{\s*amount\s*\}\}/gi, amtStr)
    .replace(/\{\{\s*bill_no\s*\}\}/gi, billNo)
    .replace(/\{\{\s*shop_name\s*\}\}/gi, shopName);
}

/**
 * Sample variables used for realistic previews in the settings UI.
 */
export const SAMPLE_PREVIEW_VARIABLES: TemplateVariables = {
  customer_name: 'Ravi Kumar',
  vehicle_model: 'Hyundai Creta',
  vehicle_number: 'AP39AB1234',
  service: 'Full Foam Wash',
  amount: 1500,
  bill_no: 'GG-1025',
  shop_name: 'GO GRAND Car Wash & Detailing',
};

/**
 * Retrieves cached message templates from localStorage with fallback to defaults.
 */
export function getMessageTemplates(): MessageTemplates {
  try {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        vehicleReceived:
          typeof parsed.vehicleReceived === 'string' && parsed.vehicleReceived.trim()
            ? parsed.vehicleReceived
            : DEFAULT_MESSAGE_TEMPLATES.vehicleReceived,
        vehicleReady:
          typeof parsed.vehicleReady === 'string' && parsed.vehicleReady.trim()
            ? parsed.vehicleReady
            : DEFAULT_MESSAGE_TEMPLATES.vehicleReady,
        whatsAppBill:
          typeof parsed.whatsAppBill === 'string' && parsed.whatsAppBill.trim()
            ? parsed.whatsAppBill
            : DEFAULT_MESSAGE_TEMPLATES.whatsAppBill,
        sms:
          typeof parsed.sms === 'string' && parsed.sms.trim()
            ? parsed.sms
            : DEFAULT_MESSAGE_TEMPLATES.sms,
      };
    }
  } catch (e) {
    console.error('Failed to parse cached message templates:', e);
  }
  return { ...DEFAULT_MESSAGE_TEMPLATES };
}

/**
 * Background synchronization with Supabase app_settings.
 */
export async function syncMessageTemplatesFromSupabase(): Promise<MessageTemplates> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'message_templates')
        .single();

      if (!error && data?.value && typeof data.value === 'object') {
        const remote = data.value;
        const merged: MessageTemplates = {
          vehicleReceived: remote.vehicleReceived || DEFAULT_MESSAGE_TEMPLATES.vehicleReceived,
          vehicleReady: remote.vehicleReady || DEFAULT_MESSAGE_TEMPLATES.vehicleReady,
          whatsAppBill: remote.whatsAppBill || DEFAULT_MESSAGE_TEMPLATES.whatsAppBill,
          sms: remote.sms || DEFAULT_MESSAGE_TEMPLATES.sms,
        };
        try {
          localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      }
    } catch (err) {
      console.warn('Could not sync message templates from Supabase:', err);
    }
  }
  return getMessageTemplates();
}

/**
 * Saves customized message templates to localStorage & Supabase app_settings.
 * Enforces Owner-only authorization.
 */
export async function saveMessageTemplates(
  updates: Partial<MessageTemplates>
): Promise<MessageTemplates> {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can modify message templates.');
  }

  const current = getMessageTemplates();
  const merged: MessageTemplates = {
    vehicleReceived:
      typeof updates.vehicleReceived === 'string' && updates.vehicleReceived.trim()
        ? updates.vehicleReceived.trim()
        : current.vehicleReceived,
    vehicleReady:
      typeof updates.vehicleReady === 'string' && updates.vehicleReady.trim()
        ? updates.vehicleReady.trim()
        : current.vehicleReady,
    whatsAppBill:
      typeof updates.whatsAppBill === 'string' && updates.whatsAppBill.trim()
        ? updates.whatsAppBill.trim()
        : current.whatsAppBill,
    sms:
      typeof updates.sms === 'string' && updates.sms.trim()
        ? updates.sms.trim()
        : current.sms,
  };

  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to cache message templates locally:', e);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.from('app_settings').upsert({
        key: 'message_templates',
        value: merged,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Could not save message templates to Supabase app_settings:', error.message);
      }
    } catch (err) {
      console.warn('Supabase message templates sync error:', err);
    }
  }

  return merged;
}
