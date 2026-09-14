import { supabase, isSupabaseConfigured } from '../config/supabaseClient';

export const UPI_STORAGE_KEY = 'go-grand-business-upi-id';

/**
 * Retrieves the configured GO GRAND business UPI ID.
 * Returns empty string if not set.
 */
export function getStoredUpiId(): string {
  try {
    const stored = localStorage.getItem(UPI_STORAGE_KEY);
    if (stored && typeof stored === 'string') {
      return stored.trim();
    }
  } catch (e) {
    console.error('Failed to get stored UPI ID:', e);
  }
  return '';
}

/**
 * Saves the GO GRAND business UPI ID securely to local storage & Supabase.
 */
export function saveUpiId(upiId: string): void {
  const clean = upiId.trim();
  try {
    localStorage.setItem(UPI_STORAGE_KEY, clean);
  } catch (e) {
    console.error('Failed to save UPI ID locally:', e);
  }

  // Also sync with Supabase app_settings if configured
  if (isSupabaseConfigured() && supabase) {
    (async () => {
      try {
        const { error } = await supabase
          .from('app_settings')
          .upsert({
            key: 'upi_payment_settings',
            value: { upi_id: clean },
            updated_at: new Date().toISOString(),
          });
        if (error) {
          console.warn('Could not sync UPI ID to Supabase app_settings:', error.message);
        }
      } catch (err) {
        console.warn('Supabase UPI sync failed:', err);
      }
    })();
  }
}

/**
 * Generates an NPCI-compliant UPI Payment deep-link URI.
 * @param upiId The recipient UPI ID (e.g. gogrand@upi)
 * @param amount Exact invoice amount
 * @param vehicleNumber Vehicle identifier for payment transaction note
 */
export function generateUpiPaymentUri(
  upiId: string,
  amount: string | number,
  vehicleNumber?: string
): string {
  const cleanUpi = upiId.trim();
  if (!cleanUpi) return '';

  let amtStr = '0.00';
  if (typeof amount === 'number') {
    amtStr = Math.max(0, amount).toFixed(2);
  } else if (typeof amount === 'string' && amount.trim()) {
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, '') || '0');
    amtStr = Math.max(0, parsed).toFixed(2);
  }

  const payeeName = encodeURIComponent('GO GRAND Car Wash and Detailing');
  const vehNo = vehicleNumber ? vehicleNumber.toUpperCase().trim() : 'Vehicle';
  const note = encodeURIComponent(`GO GRAND Bill - ${vehNo}`);

  return `upi://pay?pa=${cleanUpi}&pn=${payeeName}&am=${amtStr}&cu=INR&tn=${note}`;
}
