import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
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
  Info,
  PlusCircle,
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
  description: string;
  icon: React.ElementType;
  iconColor: string;
  badge: string;
  variables: { token: string; label: string }[];
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key: 'vehicleReceived',
    title: 'Vehicle Received Message',
    description: 'Customer notification when the vehicle is received at the workshop.',
    icon: Car,
    iconColor: 'text-amber-500 dark:text-amber-400',
    badge: 'Vehicle Intake',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill Number' },
    ],
  },
  {
    key: 'vehicleReady',
    title: 'Vehicle Ready Message',
    description: 'Customer notification when the vehicle detailing is finished and ready for pickup.',
    icon: Sparkles,
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    badge: 'Ready for Pickup',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill Number' },
    ],
  },
  {
    key: 'whatsAppBill',
    title: 'WhatsApp Bill Message',
    description: 'Message sent together with the PDF invoice document.',
    icon: FileText,
    iconColor: 'text-blue-500 dark:text-blue-400',
    badge: 'Tax Invoice',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Service]', label: '+ Service' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill Number' },
    ],
  },
  {
    key: 'sms',
    title: 'SMS Message',
    description: 'Short customer SMS sent directly via mobile network messaging.',
    icon: Smartphone,
    iconColor: 'text-purple-500 dark:text-purple-400',
    badge: 'Direct SMS',
    variables: [
      { token: '[Customer Name]', label: '+ Customer Name' },
      { token: '[Vehicle Model]', label: '+ Vehicle Model' },
      { token: '[Vehicle Number]', label: '+ Vehicle Number' },
      { token: '[Amount]', label: '+ Amount' },
      { token: '[Bill Number]', label: '+ Bill Number' },
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
    vehicleReceived: true,
    vehicleReady: true,
    whatsAppBill: true,
    sms: true,
  });
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Textarea refs to support detail insertion at current cursor position
  const textareaRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  useEffect(() => {
    // Initial local cache read
    const local = getMessageTemplates();
    setTemplates(local);

    // Sync latest from Supabase app_settings
    syncMessageTemplatesFromSupabase().then((synced) => {
      setTemplates(synced);
    }).catch(() => {});
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
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
      showToast('success', `${key === 'vehicleReceived' ? 'Vehicle Received' : key === 'vehicleReady' ? 'Vehicle Ready' : key === 'whatsAppBill' ? 'WhatsApp Bill' : 'SMS'} message saved successfully!`);
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

    // Validate that no section is completely empty
    for (const config of TEMPLATE_CONFIGS) {
      if (!templates[config.key]?.trim()) {
        showToast('error', `Message "${config.title}" cannot be empty.`);
        return;
      }
    }

    setSaveAllLoading(true);
    try {
      await saveMessageTemplates(templates);
      showToast('success', 'All messages saved and synced successfully!');
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
      showToast('success', `Reset "${config?.title || key}" to default.`);
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
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full pb-20">
        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div
            className={`fixed top-18 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold transition-all animate-bounce ${
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
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-neutral-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                Message Customization
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800/80 uppercase tracking-wide">
                <Shield size={10} /> Owner Only
              </span>
              <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">
                Type or paste your complete WhatsApp and SMS messages exactly as desired
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveAll}
            disabled={saveAllLoading}
            className="self-start sm:self-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black tracking-wide uppercase shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{saveAllLoading ? 'Saving All...' : 'Save All Messages'}</span>
          </button>
        </div>

        {/* INFO GUIDANCE BANNER */}
        <div className="mb-6 p-3.5 rounded-xl bg-slate-200/70 dark:bg-[#111111] border border-slate-300 dark:border-[#222222] flex items-start gap-3 text-xs text-slate-700 dark:text-neutral-300">
          <Info size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-slate-900 dark:text-white">Full Message Editor:</span> Paste or type your complete WhatsApp message with emojis (🚗, ✨), <code className="text-xs px-1 rounded bg-slate-300 dark:bg-neutral-800">*bold*</code>, and line breaks. To include live customer or vehicle details, click any of the <strong>Insert Details</strong> buttons.
          </div>
        </div>

        {/* 4 MESSAGE SECTIONS */}
        <div className="space-y-6">
          {TEMPLATE_CONFIGS.map((config) => {
            const Icon = config.icon;
            const currentText = templates[config.key] || '';
            const isSaving = savingKey === config.key;
            const isSaved = savedKey === config.key;
            const isPreviewing = previewOpen[config.key] ?? true;
            const previewText = renderTemplate(currentText, SAMPLE_PREVIEW_VARIABLES);

            return (
              <div
                key={config.key}
                className="bg-white dark:bg-[#0D0D0D] border border-slate-200 dark:border-[#202020] rounded-2xl shadow-sm overflow-hidden transition-colors"
              >
                {/* SECTION HEADER */}
                <div className="p-4 border-b border-slate-100 dark:border-[#1A1A1A] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-[#121212]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-200/80 dark:bg-[#1E1E1E] text-slate-800 dark:text-white shrink-0">
                      <Icon size={18} className={config.iconColor} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                          {config.title}
                        </h2>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-[#222222] text-slate-600 dark:text-neutral-400">
                          {config.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                        {config.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => togglePreview(config.key)}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#202020] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title={isPreviewing ? 'Hide live preview' : 'Show live preview'}
                    >
                      {isPreviewing ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span>{isPreviewing ? 'Hide Preview' : 'Live Preview'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetDefault(config.key)}
                      className="p-1.5 rounded-lg text-slate-500 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Reset to default message"
                    >
                      <RotateCcw size={13} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* SECTION BODY */}
                <div className="p-4 space-y-4">
                  {/* MULTILINE MESSAGE EDITOR */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold uppercase text-slate-700 dark:text-neutral-300 tracking-wide">
                        Message Content
                      </label>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-neutral-500">
                        {currentText.length} characters
                      </span>
                    </div>
                    <textarea
                      ref={(el) => {
                        textareaRefs.current[config.key] = el;
                      }}
                      value={currentText}
                      onChange={(e) => handleTextChange(config.key, e.target.value)}
                      rows={6}
                      className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#161616] border border-slate-300 dark:border-[#2C2C2C] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 text-sm font-normal focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y leading-relaxed transition-all"
                      placeholder="Type or paste your customized message here..."
                    />
                  </div>

                  {/* USER-FRIENDLY INSERT DETAILS BUTTONS */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <PlusCircle size={13} className="text-blue-500 dark:text-blue-400" />
                      <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-neutral-400 tracking-wider">
                        Insert Details (Click to insert at cursor):
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {config.variables.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => handleInsertToken(config.key, v.token)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#181818] hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-800 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-300 dark:border-[#2A2A2A] hover:border-blue-300 dark:hover:border-blue-700 text-xs font-semibold transition-colors cursor-pointer active:scale-95"
                          title={`Insert ${v.token} at current cursor`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* LIVE PREVIEW SECTION */}
                  {isPreviewing && (
                    <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#080808] border border-slate-200 dark:border-[#1E1E1E]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Eye size={12} /> Live Preview (Sample Output)
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-neutral-500">
                          Recipient: Ravi Kumar (AP39AB1234)
                        </span>
                      </div>
                      <div className="p-3.5 rounded-lg bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-[#242424] text-xs text-slate-800 dark:text-neutral-200 font-sans whitespace-pre-wrap leading-relaxed shadow-inner">
                        {previewText || <span className="text-slate-400 italic">No message content</span>}
                      </div>
                    </div>
                  )}

                  {/* ACTION BAR */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-[#1A1A1A]">
                    <div className="text-xs">
                      {isSaved ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 size={14} /> Saved & Synced
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-neutral-500">
                          Preserves emojis, bold (*text*), and line breaks
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveSingle(config.key)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 text-white dark:text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? (
                          <span>Saving...</span>
                        ) : (
                          <>
                            <Save size={13} />
                            <span>Save Message</span>
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
