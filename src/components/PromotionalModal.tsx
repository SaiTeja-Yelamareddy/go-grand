import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Megaphone, Plus, Users, Send, RefreshCw, Eye } from 'lucide-react';
import { type JobRecord } from '../utils/draftStorage';
import {
  getMessageTemplates,
  renderTemplate,
  formatMessageDateIST,
  formatMessageTimeIST,
  SHOP_NAME,
} from '../utils/templateStorage';
import { sendPromotionalWhatsAppViaBackend } from '../utils/invoiceUtils';
import { useNotifications } from './NotificationSystem';

interface PromotionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: JobRecord[];
  initialTargetRecord?: JobRecord | null;
}

const CUSTOMER_DETAILS = [
  { label: 'Customer Name', token: '[Customer Name]' },
  { label: 'Vehicle Model', token: '[Vehicle Model]' },
  { label: 'Vehicle Number', token: '[Vehicle Number]' },
  { label: 'Date', token: '[Date]' },
  { label: 'Time', token: '[Time]' },
  { label: 'Service', token: '[Service]' },
  { label: 'Amount', token: '[Amount]' },
  { label: 'Bill Number', token: '[Bill Number]' },
];

export const PromotionalModal: React.FC<PromotionalModalProps> = ({
  isOpen,
  onClose,
  records,
  initialTargetRecord,
}) => {
  const { notify } = useNotifications();
  const [templateText, setTemplateText] = useState<string>('');
  const [showDetailMenu, setShowDetailMenu] = useState(false);
  const [sendMode, setSendMode] = useState<'single' | 'all'>('all');
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Deduplicate records by clean 10-digit phone number so multiple jobs for the same customer don't cause duplicate messages
  const uniqueRecipients = useMemo(() => {
    const map = new Map<string, JobRecord>();
    records.forEach((rec) => {
      const clean = (rec.phoneNumber || '').replace(/\D/g, '');
      const key = clean.length >= 10 ? clean.slice(-10) : clean;
      if (key && !map.has(key)) {
        map.set(key, rec);
      }
    });
    return Array.from(map.values());
  }, [records]);

  // Initialize template text from saved templates
  useEffect(() => {
    if (isOpen) {
      const savedTemplates = getMessageTemplates();
      setTemplateText(savedTemplates.promotional || '');
      if (initialTargetRecord) {
        setSendMode('single');
      } else {
        setSendMode('all');
      }
      setIsSending(false);
      setSendProgress(null);
    }
  }, [isOpen, initialTargetRecord]);

  // Close token dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDetailMenu(false);
      }
    };
    if (showDetailMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDetailMenu]);

  if (!isOpen) return null;

  const targetRecipients = sendMode === 'single' && initialTargetRecord
    ? [initialTargetRecord]
    : uniqueRecipients;

  const sampleCustomer = targetRecipients[0] || initialTargetRecord || records[0];

  // Live preview rendered with current IST Date and Time
  const previewText = sampleCustomer
    ? renderTemplate(templateText, {
        customer_name: sampleCustomer.customerName,
        vehicle_model: sampleCustomer.vehicleName,
        vehicle_number: sampleCustomer.vehicleNumber,
        service: Array.isArray(sampleCustomer.services)
          ? sampleCustomer.services.join(', ')
          : sampleCustomer.services || sampleCustomer.service || 'Car Wash & Detailing',
        amount: sampleCustomer.price || '0',
        bill_no: sampleCustomer.billNo || 'GG-1001',
        shop_name: SHOP_NAME,
        date: formatMessageDateIST(new Date()),
        time: formatMessageTimeIST(new Date()),
      })
    : '';

  const handleInsertToken = (token: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? templateText.length;
      const end = textarea.selectionEnd ?? templateText.length;
      const updated = templateText.substring(0, start) + token + templateText.substring(end);
      setTemplateText(updated);
      setShowDetailMenu(false);

      setTimeout(() => {
        textarea.focus();
        const newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      setTemplateText((prev) => (prev ? `${prev} ${token}` : token));
      setShowDetailMenu(false);
    }
  };

  const handleSendPromotional = async () => {
    if (!templateText.trim()) {
      notify({ type: 'warning', title: 'Empty Message', message: 'Please enter a promotional message.' });
      return;
    }

    if (targetRecipients.length === 0) {
      notify({ type: 'error', title: 'No Recipients', message: 'No valid customers available to message.' });
      return;
    }

    setIsSending(true);
    setSendProgress({ current: 0, total: targetRecipients.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetRecipients.length; i++) {
      const rec = targetRecipients[i];
      setSendProgress({ current: i + 1, total: targetRecipients.length });

      // Actual send timestamp in Asia/Kolkata
      const sendTime = new Date();
      const resolvedMsg = renderTemplate(templateText, {
        customer_name: rec.customerName,
        vehicle_model: rec.vehicleName,
        vehicle_number: rec.vehicleNumber,
        service: Array.isArray(rec.services)
          ? rec.services.join(', ')
          : rec.services || rec.service || 'Car Wash & Detailing',
        amount: rec.price || '0',
        bill_no: rec.billNo || '',
        shop_name: SHOP_NAME,
        date: formatMessageDateIST(sendTime),
        time: formatMessageTimeIST(sendTime),
      });

      const idempotencyKey = `promo_${rec.id || rec.phoneNumber}_${Date.now()}`;

      try {
        const res = await sendPromotionalWhatsAppViaBackend(rec.phoneNumber, resolvedMsg, rec, idempotencyKey);
        if (res.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }

      // Small delay between sends to respect WhatsApp rate limits
      if (i < targetRecipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setIsSending(false);
    setSendProgress(null);

    if (successCount > 0) {
      notify({
        type: 'success',
        title: 'Promotional Messages Sent',
        message: `Successfully dispatched to ${successCount} customer${successCount > 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}.`,
      });
      onClose();
    } else {
      notify({
        type: 'error',
        title: 'Sending Failed',
        message: 'Could not deliver promotional messages. Check WhatsApp connection status.',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={!isSending ? onClose : undefined} />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-[#0C0C0C] rounded-2xl border border-slate-200 dark:border-[#1E1E1E] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900 dark:text-white transition-all">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#1E1E1E] flex items-center justify-between bg-slate-50/50 dark:bg-[#101010]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Megaphone size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">
                Promotional WhatsApp Message
              </h2>
              <p className="text-[11px] font-medium text-slate-500 dark:text-neutral-400">
                Compose offers and updates for customers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-neutral-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors cursor-pointer disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* RECIPIENT TARGET SELECTOR */}
          <div className="bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Users size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  {sendMode === 'single' && initialTargetRecord
                    ? `Single Customer: ${initialTargetRecord.customerName} (${initialTargetRecord.vehicleNumber})`
                    : `All Unique Customers (${uniqueRecipients.length} recipients)`}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400">
                  {sendMode === 'single'
                    ? initialTargetRecord?.phoneNumber
                    : 'Deduplicated by phone number'}
                </p>
              </div>
            </div>

            {initialTargetRecord && (
              <button
                type="button"
                onClick={() => setSendMode((prev) => (prev === 'single' ? 'all' : 'single'))}
                disabled={isSending}
                className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
              >
                {sendMode === 'single' ? `Send to All (${uniqueRecipients.length})` : 'Send Single Only'}
              </button>
            )}
          </div>

          {/* COMPOSER TEXTAREA */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Message Composer
              </label>
              <span className="text-[11px] text-slate-400 dark:text-neutral-500">
                {templateText.length} characters
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              disabled={isSending}
              rows={6}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 text-xs sm:text-sm font-normal focus:outline-none focus:border-slate-800 dark:focus:border-neutral-300 resize-y leading-relaxed transition-colors disabled:opacity-60"
              placeholder="Type your promotional message here..."
            />
          </div>

          {/* + ADD CUSTOMER DETAILS DROPDOWN */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowDetailMenu((prev) => !prev)}
              disabled={isSending}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer py-1 disabled:opacity-50"
            >
              <Plus size={14} />
              <span>Add customer details</span>
            </button>

            {showDetailMenu && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-52 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-xl shadow-2xl py-1 divide-y divide-slate-100 dark:divide-[#202020] animate-fade-in">
                {CUSTOMER_DETAILS.map((detail) => (
                  <button
                    key={detail.token}
                    type="button"
                    onClick={() => handleInsertToken(detail.token)}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-800 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-[#1E1E1E] transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{detail.label}</span>
                    <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono">
                      {detail.token}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* LIVE PREVIEW BOX */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#202020]">
            <div className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Eye size={12} /> Live Preview (Asia/Kolkata IST)
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-[#0A0A0A] border border-slate-200/80 dark:border-[#222222] text-xs text-slate-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {previewText || <span className="text-slate-400 italic">No message content to preview</span>}
            </div>
          </div>

          {/* SEND PROGRESS BAR */}
          {isSending && sendProgress && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-center space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-300">
                <span>Sending WhatsApp Messages...</span>
                <span>
                  {sendProgress.current} / {sendProgress.total}
                </span>
              </div>
              <div className="w-full bg-rose-200 dark:bg-rose-900/50 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-rose-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-[#1E1E1E] bg-slate-50/50 dark:bg-[#101010] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendPromotional}
            disabled={isSending || targetRecipients.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed"
          >
            {isSending ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send size={13} />
                <span>
                  {sendMode === 'single'
                    ? 'Send Promotional Message'
                    : `Broadcast to ${targetRecipients.length} Customers`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
