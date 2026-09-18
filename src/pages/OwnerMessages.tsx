import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Car,
  FileText,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { Header } from '../components/Header';
import { NavigationDrawer } from '../components/NavigationDrawer';
import { isOwnerAuthenticated } from '../config/authConfig';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  getMessageTemplates,
  saveMessageTemplates,
  syncMessageTemplatesFromSupabase,
  renderTemplate,
  SAMPLE_PREVIEW_VARIABLES,
  type MessageTemplates,
} from '../utils/templateStorage';

interface OwnerMessagesProps {
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

interface TemplateConfig {
  key: keyof MessageTemplates;
  title: string;
  icon: React.ElementType;
  iconColor: string;
  variables: { token: string; label: string }[];
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key: 'vehicleReceived',
    title: 'Vehicle Received',
    icon: Car,
    iconColor: 'text-amber-500 dark:text-amber-400',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill No' },
    ],
  },
  {
    key: 'vehicleReady',
    title: 'Vehicle Ready',
    icon: Sparkles,
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill No' },
    ],
  },
  {
    key: 'whatsAppBill',
    title: 'WhatsApp Invoice / Bill',
    icon: FileText,
    iconColor: 'text-blue-500 dark:text-blue-400',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill No' },
    ],
  },
  {
    key: 'sms',
    title: 'SMS Message',
    icon: Smartphone,
    iconColor: 'text-purple-500 dark:text-purple-400',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill No' },
    ],
  },
];

export const OwnerMessages: React.FC<OwnerMessagesProps> = ({
  deferredPrompt,
  onInstallApp,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_MESSAGE_TEMPLATES);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<{ [key: string]: boolean }>({
    vehicleReceived: false,
    vehicleReady: false,
    whatsAppBill: false,
    sms: false,
  });
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Textarea refs to support detail insertion at current cursor position
  const textareaRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  useEffect(() => {
    // Initial local cache read
    const local = getMessageTemplates();
    setTemplates(local);

    // Sync latest from Supabase app_settings
    syncMessageTemplatesFromSupabase()
      .then((synced) => {
        setTemplates(synced);
      })
      .catch(() => {});
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleTextChange = (key: keyof MessageTemplates, value: string) => {
    setTemplates((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleInsertToken = (key: keyof MessageTemplates, token: string) => {
    const textarea = textareaRefs.current[key];
    const currentValue = templates[key] || '';

    if (textarea) {
      const start = textarea.selectionStart ?? currentValue.length;
      const end = textarea.selectionEnd ?? currentValue.length;
      const updated = currentValue.substring(0, start) + token + currentValue.substring(end);

      setTemplates((prev) => ({
        ...prev,
        [key]: updated,
      }));

      // Restore cursor right after the inserted token
      setTimeout(() => {
        textarea.focus();
        const newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      setTemplates((prev) => ({
        ...prev,
        [key]: currentValue ? `${currentValue} ${token}` : token,
      }));
    }
  };

  const handleSaveSingle = async (key: keyof MessageTemplates) => {
    if (!isOwnerAuthenticated()) {
      showToast('error', 'Unauthorized: Owner access required.');
      return;
    }

    const value = templates[key]?.trim();
    if (!value) {
      showToast('error', 'Cannot save an empty message.');
      return;
    }

    setSavingKey(key);
    try {
      await saveMessageTemplates({ [key]: templates[key] });
      setSavedKey(key);
      showToast('success', 'Message saved successfully!');
      setTimeout(() => setSavedKey(null), 3000);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save message.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    if (!isOwnerAuthenticated()) {
      showToast('error', 'Unauthorized: Owner access required.');
      return;
    }

    // Validate that no section is empty
    for (const config of TEMPLATE_CONFIGS) {
      if (!templates[config.key]?.trim()) {
        showToast('error', `Message "${config.title}" cannot be empty.`);
        return;
      }
    }

    setSaveAllLoading(true);
    try {
      await saveMessageTemplates(templates);
      showToast('success', 'All messages saved successfully!');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save message templates.');
    } finally {
      setSaveAllLoading(false);
    }
  };

  const handleResetDefault = async (key: keyof MessageTemplates) => {
    const config = TEMPLATE_CONFIGS.find((c) => c.key === key);
    if (!window.confirm(`Reset "${config?.title || key}" to default message?`)) {
      return;
    }

    const defaultVal = DEFAULT_MESSAGE_TEMPLATES[key];
    const updated = { ...templates, [key]: defaultVal };
    setTemplates(updated);

    try {
      await saveMessageTemplates({ [key]: defaultVal });
      showToast('success', `Reset to default message.`);
    } catch (err: any) {
      showToast('error', 'Failed to save default message.');
    }
  };

  const togglePreview = (key: string) => {
    setPreviewOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
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

      {/* MAIN CONTENT */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full pb-20">
        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div
            className={`fixed top-18 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold transition-all animate-bounce ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border border-emerald-400'
                : 'bg-red-600 text-white border border-red-400'
            }`}
          >
            {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* PAGE TITLE BAR */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
              Message Customization
            </h1>
            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium mt-0.5">
              Customize WhatsApp & SMS messages sent to customers
            </p>
          </div>

          <button
            onClick={handleSaveAll}
            disabled={saveAllLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold tracking-wide uppercase shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{saveAllLoading ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>

        {/* 4 CLEAN MESSAGE CARDS */}
        <div className="space-y-5">
          {TEMPLATE_CONFIGS.map((config) => {
            const Icon = config.icon;
            const currentText = templates[config.key] || '';
            const isSaving = savingKey === config.key;
            const isSaved = savedKey === config.key;
            const isPreviewing = previewOpen[config.key] ?? false;
            const previewText = renderTemplate(currentText, SAMPLE_PREVIEW_VARIABLES);

            return (
              <div
                key={config.key}
                className="bg-white dark:bg-[#0E0E0E] border border-slate-200 dark:border-[#222222] rounded-2xl shadow-xs overflow-hidden transition-colors"
              >
                {/* CARD HEADER */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-[#1A1A1A] flex items-center justify-between bg-slate-50/70 dark:bg-[#141414]">
                  <div className="flex items-center gap-2.5">
                    <Icon size={17} className={config.iconColor} />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                      {config.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePreview(config.key)}
                      className="px-2 py-1 rounded-lg text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#222222] text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {isPreviewing ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{isPreviewing ? 'Hide' : 'Preview'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetDefault(config.key)}
                      className="px-2 py-1 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title="Reset to default"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* CARD BODY */}
                <div className="p-4 space-y-3">
                  {/* TEXTAREA EDITOR */}
                  <textarea
                    ref={(el) => {
                      textareaRefs.current[config.key] = el;
                    }}
                    value={currentText}
                    onChange={(e) => handleTextChange(config.key, e.target.value)}
                    rows={5}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#282828] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 text-xs sm:text-sm font-normal focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 resize-y leading-relaxed transition-all"
                    placeholder="Type or paste message..."
                  />

                  {/* INSERT DETAILS BUTTONS */}
                  <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-neutral-500 mr-1">
                      Insert:
                    </span>
                    {config.variables.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => handleInsertToken(config.key, v.token)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1A1A1A] hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-[#2B2B2B] text-xs font-medium transition-colors cursor-pointer active:scale-95"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {/* PREVIEW CONTAINER */}
                  {isPreviewing && (
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#090909] border border-slate-200 dark:border-[#1E1E1E]">
                      <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Eye size={11} /> Sample Preview
                      </div>
                      <div className="p-2.5 rounded-lg bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#222222] text-xs text-slate-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">
                        {previewText || <span className="text-slate-400 italic">Empty</span>}
                      </div>
                    </div>
                  )}

                  {/* CARD FOOTER */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-[#1A1A1A]">
                    <span className="text-[11px] text-slate-400 dark:text-neutral-500">
                      {currentText.length} characters
                    </span>

                    <div className="flex items-center gap-2">
                      {isSaved && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveSingle(config.key)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 text-white dark:text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? (
                          <span>Saving...</span>
                        ) : (
                          <>
                            <Save size={12} />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};
