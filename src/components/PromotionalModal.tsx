import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Megaphone, Plus, Users, Send, RefreshCw, Eye, CheckCircle2, AlertTriangle, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { type JobRecord } from '../utils/draftStorage';
import {
  getMessageTemplates,
  renderTemplate,
  formatMessageDateIST,
  formatMessageTimeIST,
  SHOP_NAME,
} from '../utils/templateStorage';
import { sendPromotionalWhatsAppViaBackend, classifyWhatsAppError } from '../utils/invoiceUtils';
import { useNotifications } from './NotificationSystem';

interface PromotionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: JobRecord[];
  initialTargetRecord?: JobRecord | null;
}

export type RecipientDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unconfirmed';

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
  const { notify, notifyWhatsAppState } = useNotifications();
  const [templateText, setTemplateText] = useState<string>('');
  const [showDetailMenu, setShowDetailMenu] = useState(false);
  const [sendMode, setSendMode] = useState<'single' | 'all'>('all');
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [recipientStatuses, setRecipientStatuses] = useState<Record<string, RecipientDeliveryStatus>>({});
  const [bulkSummary, setBulkSummary] = useState<{ sent: number; failed: number; unconfirmed: number } | null>(null);
  const [showRecipientList, setShowRecipientList] = useState(false);

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
      setRecipientStatuses({});
      setBulkSummary(null);
      setShowRecipientList(false);
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

  const getRecipientKey = (rec: JobRecord, idx: number) => {
    return rec.id || `${rec.phoneNumber || 'unknown'}_${idx}`;
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

    // SINGLE SEND FLOW
    if (sendMode === 'single' && initialTargetRecord) {
      const notifId = notifyWhatsAppState('sending');
      setIsSending(true);

      const sendTime = new Date();
      const resolvedMsg = renderTemplate(templateText, {
        customer_name: initialTargetRecord.customerName,
        vehicle_model: initialTargetRecord.vehicleName,
        vehicle_number: initialTargetRecord.vehicleNumber,
        service: Array.isArray(initialTargetRecord.services)
          ? initialTargetRecord.services.join(', ')
          : initialTargetRecord.services || initialTargetRecord.service || 'Car Wash & Detailing',
        amount: initialTargetRecord.price || '0',
        bill_no: initialTargetRecord.billNo || '',
        shop_name: SHOP_NAME,
        date: formatMessageDateIST(sendTime),
        time: formatMessageTimeIST(sendTime),
      });

      const idempotencyKey = `promo_${initialTargetRecord.id || initialTargetRecord.phoneNumber}_${Date.now()}`;
      try {
        const res = await sendPromotionalWhatsAppViaBackend(
          initialTargetRecord.phoneNumber,
          resolvedMsg,
          initialTargetRecord,
          idempotencyKey
        );
        notifyWhatsAppState(res.status, notifId, res.error ? { description: res.error } : undefined);
        if (res.status === 'sent') {
          setTimeout(onClose, 800);
        }
      } catch (err: any) {
        const classified = classifyWhatsAppError(err);
        notifyWhatsAppState(classified.status, notifId, { description: classified.error || err?.message });
      } finally {
        setIsSending(false);
      }
      return;
    }

    // BULK SEND FLOW
    setIsSending(true);
    setShowRecipientList(true);
    setSendProgress({ current: 0, total: targetRecipients.length });

    // Initialize all recipient statuses to pending
    const initialStatuses: Record<string, RecipientDeliveryStatus> = {};
    targetRecipients.forEach((rec, idx) => {
      initialStatuses[getRecipientKey(rec, idx)] = 'pending';
    });
    setRecipientStatuses(initialStatuses);

    // Initial non-blocking notification
    const notifId = notifyWhatsAppState('sending', undefined, {
      description: `Sending messages to ${targetRecipients.length} recipients...`,
    });

    let sentCount = 0;
    let failedCount = 0;
    let unconfirmedCount = 0;
    let hadDisconnected = false;
    let hadServerError = false;

    for (let i = 0; i < targetRecipients.length; i++) {
      const rec = targetRecipients[i];
      const recKey = getRecipientKey(rec, i);
      setSendProgress({ current: i + 1, total: targetRecipients.length });

      // Mark this individual recipient as sending
      setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'sending' }));

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
        if (res.status === 'sent') {
          sentCount++;
          setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'sent' }));
        } else if (res.status === 'unconfirmed') {
          unconfirmedCount++;
          setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'unconfirmed' }));
        } else if (res.status === 'disconnected') {
          failedCount++;
          hadDisconnected = true;
          setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'failed' }));
        } else if (res.status === 'server_error') {
          failedCount++;
          hadServerError = true;
          setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'failed' }));
        } else {
          failedCount++;
          setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'failed' }));
        }
      } catch (err: any) {
        const classified = classifyWhatsAppError(err);
        if (classified.status === 'disconnected') hadDisconnected = true;
        if (classified.status === 'server_error') hadServerError = true;
        failedCount++;
        setRecipientStatuses((prev) => ({ ...prev, [recKey]: 'failed' }));
      }

      // Small delay between sends to respect rate limits
      if (i < targetRecipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    const finalSummary = { sent: sentCount, failed: failedCount, unconfirmed: unconfirmedCount };
    setBulkSummary(finalSummary);
    setIsSending(false);
    setSendProgress(null);

    // Summary description matching specification: "18 sent · 2 failed · 1 unconfirmed"
    const summaryText = `${sentCount} sent · ${failedCount} failed · ${unconfirmedCount} unconfirmed`;

    if (sentCount === targetRecipients.length) {
      notifyWhatsAppState('sent', notifId, {
        description: summaryText,
      });
    } else if (hadDisconnected && sentCount === 0 && unconfirmedCount === 0) {
      notifyWhatsAppState('disconnected', notifId, {
        description: `WhatsApp disconnected. ${summaryText}`,
      });
    } else if (hadServerError && sentCount === 0 && unconfirmedCount === 0) {
      notifyWhatsAppState('server_error', notifId, {
        description: `Server unavailable. ${summaryText}`,
      });
    } else if (unconfirmedCount > 0) {
      notifyWhatsAppState('unconfirmed', notifId, {
        description: summaryText,
      });
    } else if (failedCount > 0) {
      notifyWhatsAppState('failed', notifId, {
        description: summaryText,
      });
    } else {
      notifyWhatsAppState('sent', notifId, {
        description: summaryText,
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
          {/* SEND PROGRESS & STATUS SUMMARY */}
          {(isSending || bulkSummary) && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#202020] space-y-3">
              {/* Progress bar when sending */}
              {isSending && sendProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-neutral-200">
                    <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                      <RefreshCw size={13} className="animate-spin" />
                      Dispatching Messages...
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {sendProgress.current} / {sendProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Status Summary Banner (e.g. 18 sent · 2 failed · 1 unconfirmed) */}
              {bulkSummary && (
                <div className="p-3 rounded-lg bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#282828] flex items-center justify-between gap-2 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">Delivery Summary</div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {bulkSummary.sent} sent
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-rose-700 dark:text-rose-400 font-bold">
                      {bulkSummary.failed} failed
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold">
                      {bulkSummary.unconfirmed} unconfirmed
                    </span>
                  </div>
                </div>
              )}

              {/* Collapsible toggle for recipient list */}
              {sendMode === 'all' && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRecipientList((prev) => !prev)}
                    className="w-full py-1.5 px-2 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Recipient Status List ({targetRecipients.length})</span>
                    {showRecipientList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Scrollable Recipient Status List */}
                  {showRecipientList && (
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-[#1C1C1C]">
                      {targetRecipients.map((rec, idx) => {
                        const recKey = getRecipientKey(rec, idx);
                        const status: RecipientDeliveryStatus = recipientStatuses[recKey] || 'pending';

                        return (
                          <div
                            key={recKey}
                            className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 dark:text-neutral-100 truncate">
                                {rec.customerName || 'Customer'}
                                {rec.vehicleNumber ? ` (${rec.vehicleNumber})` : ''}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono">
                                {rec.phoneNumber}
                              </p>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0">
                              {status === 'sent' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  <CheckCircle2 size={11} /> Sent
                                </span>
                              )}
                              {status === 'failed' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                  <AlertCircle size={11} /> Failed
                                </span>
                              )}
                              {status === 'unconfirmed' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  <AlertTriangle size={11} /> Delivery Unconfirmed
                                </span>
                              )}
                              {status === 'sending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                                  <RefreshCw size={11} className="animate-spin" /> Sending...
                                </span>
                              )}
                              {status === 'pending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700">
                                  <Clock size={11} /> Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
