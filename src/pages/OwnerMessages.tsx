import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  Car,
  Sparkles,
  FileText,
  Smartphone,
} from 'lucide-react';
import { Header } from '../components/Header';
import { NavigationDrawer } from '../components/NavigationDrawer';
import { isOwnerAuthenticated } from '../config/authConfig';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  getMessageTemplates,
  saveMessageTemplates,
  syncMessageTemplatesFromSupabase,
  type MessageTemplates,
} from '../utils/templateStorage';

interface OwnerMessagesProps {
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

interface MessageRowConfig {
  key: keyof MessageTemplates;
  title: string;
  icon: string;
  IconComponent: React.ElementType;
  iconColor: string;
  subtitle: string;
}

const MESSAGE_ROWS: MessageRowConfig[] = [
  {
    key: 'vehicleReceived',
    title: 'Vehicle Received',
    icon: '🚗',
    IconComponent: Car,
    iconColor: 'text-amber-500',
    subtitle: 'WhatsApp notification',
  },
  {
    key: 'vehicleReady',
    title: 'Vehicle Ready',
    icon: '✨',
    IconComponent: Sparkles,
    iconColor: 'text-emerald-500',
    subtitle: 'WhatsApp notification',
  },
  {
    key: 'whatsAppBill',
    title: 'WhatsApp Bill',
    icon: '🧾',
    IconComponent: FileText,
    iconColor: 'text-blue-500',
    subtitle: 'Invoice message',
  },
  {
    key: 'sms',
    title: 'SMS',
    icon: '📱',
    IconComponent: Smartphone,
    iconColor: 'text-purple-500',
    subtitle: 'Customer text message',
  },
];

const CUSTOMER_DETAILS = [
  { label: 'Customer Name', token: '[Customer Name]' },
  { label: 'Vehicle Model', token: '[Vehicle Model]' },
  { label: 'Vehicle Number', token: '[Vehicle Number]' },
  { label: 'Service', token: '[Service]' },
  { label: 'Amount', token: '[Amount]' },
  { label: 'Bill Number', token: '[Bill Number]' },
];

export const OwnerMessages: React.FC<OwnerMessagesProps> = ({
  deferredPrompt,
  onInstallApp,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_MESSAGE_TEMPLATES);
  const [activeKey, setActiveKey] = useState<keyof MessageTemplates | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDetailMenu, setShowDetailMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const detailMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Load cached templates
    const local = getMessageTemplates();
    setTemplates(local);

    // Sync latest from Supabase
    syncMessageTemplatesFromSupabase()
      .then((synced) => {
        setTemplates(synced);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (detailMenuRef.current && !detailMenuRef.current.contains(e.target as Node)) {
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

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleTextChange = (value: string) => {
    if (!activeKey) return;
    setTemplates((prev) => ({
      ...prev,
      [activeKey]: value,
    }));
  };

  const handleInsertDetail = (token: string) => {
    if (!activeKey) return;
    const textarea = textareaRef.current;
    const currentValue = templates[activeKey] || '';

    if (textarea) {
      const start = textarea.selectionStart ?? currentValue.length;
      const end = textarea.selectionEnd ?? currentValue.length;
      const updated = currentValue.substring(0, start) + token + currentValue.substring(end);

      setTemplates((prev) => ({
        ...prev,
        [activeKey]: updated,
      }));

      setShowDetailMenu(false);

      // Restore focus and cursor right after the inserted token
      setTimeout(() => {
        textarea.focus();
        const newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      setTemplates((prev) => ({
        ...prev,
        [activeKey]: currentValue ? `${currentValue} ${token}` : token,
      }));
      setShowDetailMenu(false);
    }
  };

  const handleSaveActiveMessage = async () => {
    if (!activeKey) return;

    if (!isOwnerAuthenticated()) {
      showToast('error', 'Unauthorized: Owner access required.');
      return;
    }

    const value = templates[activeKey]?.trim();
    if (!value) {
      showToast('error', 'Message cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      await saveMessageTemplates({ [activeKey]: templates[activeKey] });
      showToast('success', 'Message saved');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save message.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeRow = MESSAGE_ROWS.find((r) => r.key === activeKey);

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
      {/* HEADER */}
      <Header
        mode="owner"
        onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
      />

      {/* NAVIGATION DRAWER */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={onInstallApp}
      />

      {/* MAIN CONTAINER */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full pb-16">
        {/* TOAST CONFIRMATION */}
        {toastMessage && (
          <div
            className={`fixed top-18 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg shadow-lg text-xs font-semibold transition-all animate-fade-in ${
              toastMessage.type === 'success'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'bg-red-600 text-white'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 size={14} className="text-emerald-400 dark:text-emerald-600" />
            ) : (
              <AlertCircle size={14} />
            )}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* 1. MAIN LIST VIEW */}
        {!activeKey && (
          <div>
            {/* PAGE TITLE */}
            <div className="mb-4">
              <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase">
                MESSAGE CUSTOMIZATION
              </h1>
              <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium mt-0.5">
                Set the messages customers receive.
              </p>
            </div>

            {/* 4 SIMPLE NAVIGATION ROWS */}
            <div className="bg-white dark:bg-[#0C0C0C] border border-slate-200 dark:border-[#1E1E1E] rounded-xl divide-y divide-slate-100 dark:divide-[#181818] overflow-hidden shadow-xs">
              {MESSAGE_ROWS.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setActiveKey(row.key)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-[#141414] active:bg-slate-100 dark:active:bg-[#1A1A1A] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base select-none">{row.icon}</span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {row.title}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                        {row.subtitle}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 dark:text-neutral-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. FOCUSED DETAIL EDITOR VIEW */}
        {activeKey && activeRow && (
          <div className="space-y-4">
            {/* BACK BUTTON HEADER */}
            <button
              type="button"
              onClick={() => {
                setShowDetailMenu(false);
                setActiveKey(null);
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={15} />
              <span>{activeRow.title}</span>
            </button>

            {/* EDITOR CARD */}
            <div className="bg-white dark:bg-[#0C0C0C] border border-slate-200 dark:border-[#1E1E1E] rounded-xl p-4 space-y-3.5 shadow-xs">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-2">
                  Your message
                </label>
                <textarea
                  ref={textareaRef}
                  value={templates[activeKey] || ''}
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={9}
                  className="w-full p-3 rounded-lg bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#242424] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 text-sm font-normal focus:outline-none focus:border-slate-800 dark:focus:border-neutral-400 resize-y leading-relaxed transition-colors"
                  placeholder="Type or paste your message here..."
                />
              </div>

              {/* + ADD CUSTOMER DETAIL POPUP ACTION */}
              <div className="relative" ref={detailMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowDetailMenu((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer py-1"
                >
                  <Plus size={14} />
                  <span>Add customer detail</span>
                </button>

                {/* COMPACT DETAIL DROPDOWN MENU */}
                {showDetailMenu && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#282828] rounded-lg shadow-xl py-1 divide-y divide-slate-100 dark:divide-[#202020] animate-fade-in">
                    {CUSTOMER_DETAILS.map((detail) => (
                      <button
                        key={detail.token}
                        type="button"
                        onClick={() => handleInsertDetail(detail.token)}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-800 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-[#1E1E1E] transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <span>{detail.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* PRIMARY BOTTOM ACTION BUTTON */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveActiveMessage}
                  disabled={isSaving}
                  className="w-full py-2.5 px-4 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 text-white dark:text-black rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center shadow-xs"
                >
                  {isSaving ? 'SAVING...' : 'SAVE MESSAGE'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
