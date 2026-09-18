import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RotateCcw,
  CheckCircle2,
  X,
  Check,
  ChevronDown,
  Save,
  Search,
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Car,
} from 'lucide-react';
import { NavigationDrawer } from './NavigationDrawer';
import { Header } from './Header';
import { saveJobRecord, updateJobRecord, getJobRecordById, type JobRecord } from '../utils/draftStorage';
import { INDIAN_VEHICLE_BRANDS } from '../data/indianVehicles';
import { InvoiceModal } from './InvoiceModal';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { sendWhatsAppBillViaBackend, sendVehicleReadyWhatsAppViaBackend, sendVehicleReceivedWhatsAppViaBackend, parsePriceNumber, generateBillNo } from '../utils/invoiceUtils';
import { getMessageTemplates, renderTemplate, SHOP_NAME } from '../utils/templateStorage';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-[22px] h-[22px] text-[#25D366]' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SmsIcon: React.FC<{ className?: string }> = ({ className = 'w-[22px] h-[22px] text-[#2196F3]' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h10v2H7zm0-3h10v2H7z" />
  </svg>
);
import { getServiceSections } from '../utils/serviceStorage';
import { getCurrentStaff } from '../config/authConfig';

interface JobSheetProps {
  mode: 'staff' | 'owner';
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

interface FormState {
  vehicleNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleName: string;
  location: string;
  selectedServices: string[];
  price: string;
}

export const JobSheet: React.FC<JobSheetProps> = ({
  mode,
  deferredPrompt,
  onInstallApp,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const editId = searchParams.get('editId') || searchParams.get('edit');
  const isEditing = Boolean(editId);
  const [formData, setFormData] = useState<FormState>({
    vehicleNumber: '',
    customerName: '',
    phoneNumber: '',
    vehicleName: '',
    location: '',
    selectedServices: [],
    price: '',
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDropdownPicker, setShowDropdownPicker] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [savedVehNum, setSavedVehNum] = useState('');

  // Two-step Vehicle Selection States
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState<string>('');
  const [isManualEntry, setIsManualEntry] = useState<boolean>(false);

  const allModelOptions = useMemo(() => {
    const options: { company: string; model: string; fullName: string }[] = [];
    INDIAN_VEHICLE_BRANDS.forEach((brand) => {
      if (brand.models) {
        brand.models.forEach((mod) => {
          options.push({
            company: brand.company,
            model: mod,
            fullName: `${brand.company} ${mod}`,
          });
        });
      }
    });
    return options;
  }, []);

  const searchedModels = useMemo(() => {
    if (!vehicleSearchQuery.trim()) return [];
    const q = vehicleSearchQuery.toLowerCase().trim();
    return allModelOptions.filter(
      (opt) =>
        opt.company.toLowerCase().includes(q) ||
        opt.model.toLowerCase().includes(q) ||
        opt.fullName.toLowerCase().includes(q)
    );
  }, [vehicleSearchQuery, allModelOptions]);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [currentInvoiceRecord, setCurrentInvoiceRecord] = useState<JobRecord | null>(null);

  // Load ONLY the service sections & services created/managed in Add / Update Services
  const [sections, setSections] = useState(() => getServiceSections());

  useEffect(() => {
    setSections(getServiceSections());
  }, [showDropdownPicker]);

  const availableServices = useMemo(() => {
    const list: string[] = [];
    sections.forEach((sec) => {
      if (sec.name && sec.name.trim()) {
        const sName = sec.name.trim();
        if (!list.includes(sName)) {
          list.push(sName);
        }
      }
      if (Array.isArray(sec.services)) {
        sec.services.forEach((srv) => {
          if (srv.name && srv.name.trim()) {
            const subName = srv.name.trim();
            if (!list.includes(subName)) {
              list.push(subName);
            }
          }
        });
      }
    });
    return list;
  }, [sections]);

  const filteredServices = availableServices.filter((srv) =>
    srv.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim())
  );

  // Pre-fill form if editing an existing job
  useEffect(() => {
    if (editId) {
      const existing = getJobRecordById(editId);
      if (existing) {
        let initialServices: string[] = [];
        if (Array.isArray(existing.services)) {
          initialServices = existing.services;
        } else if (typeof existing.services === 'string' && existing.services.trim()) {
          initialServices = existing.services.split(',').map((s) => s.trim()).filter(Boolean);
        } else if (existing.service) {
          initialServices = [existing.service];
        }

        const vName = existing.vehicleName || '';
        setFormData({
          vehicleNumber: existing.vehicleNumber || '',
          customerName: existing.customerName || '',
          phoneNumber: existing.phoneNumber || '',
          vehicleName: vName,
          location: existing.location || '',
          selectedServices: initialServices,
          price: existing.price || '',
        });

        // Try to match existing vehicleName to catalog company & model
        if (vName) {
          const match = allModelOptions.find(
            (opt) => opt.fullName.toLowerCase() === vName.toLowerCase() || opt.model.toLowerCase() === vName.toLowerCase()
          );
          if (match) {
            setSelectedCompany(match.company);
            setSelectedModel(match.model);
            setIsManualEntry(false);
          } else {
            setSelectedCompany('Other');
            setIsManualEntry(true);
          }
        }
      }
    }
  }, [editId, allModelOptions]);

  const handleChange = (field: keyof FormState, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleToggleService = (serviceName: string) => {
    setFormData((prev) => {
      const exists = prev.selectedServices.includes(serviceName);
      const updated = exists
        ? prev.selectedServices.filter((s) => s !== serviceName)
        : [...prev.selectedServices, serviceName];
      return { ...prev, selectedServices: updated };
    });
    setShowDropdownPicker(false);
    if (errors.services) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.services;
        return next;
      });
    }
  };

  const handleRemoveService = (serviceName: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedServices: prev.selectedServices.filter((s) => s !== serviceName),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.vehicleNumber.trim()) {
      newErrors.vehicleNumber = 'Vehicle Number is required';
    }

    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer Name is required';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone Number is required';
    } else {
      const cleanPhone = formData.phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        newErrors.phoneNumber = 'Enter a valid 10-digit mobile number';
      }
    }

    if (formData.selectedServices.length === 0) {
      newErrors.services = 'Please select at least one Service';
    }

    if (!formData.price.trim()) {
      newErrors.price = 'Price is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveDraft = async (e?: React.FormEvent): Promise<JobRecord | null> => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      return null;
    }

    const currentStaff = getCurrentStaff();
    const staffName = mode === 'owner' ? 'Owner' : (currentStaff?.staff_name || 'Staff');
    const staffId = mode === 'owner' ? 'owner' : (currentStaff?.id || 'staff');

    const payload = {
      vehicleNumber: formData.vehicleNumber.trim().toUpperCase(),
      customerName: formData.customerName.trim(),
      phoneNumber: formData.phoneNumber.trim(),
      vehicleName: formData.vehicleName.trim(),
      services: formData.selectedServices,
      price: formData.price.trim(),
      createdBy: staffName,
      createdById: staffId,
    };

    let savedRecord: JobRecord;
    if (isEditing && editId) {
      const updated = await updateJobRecord(editId, payload);
      savedRecord = updated || {
        ...payload,
        id: editId,
        createdAt: new Date().toISOString(),
      };
    } else {
      savedRecord = await saveJobRecord(payload);
    }

    setSavedVehNum(formData.vehicleNumber.toUpperCase());
    setShowSuccessPopup(true);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
    return savedRecord;
  };

  const handleResetForm = () => {
    setFormData({
      vehicleNumber: '',
      customerName: '',
      phoneNumber: '',
      vehicleName: '',
      location: '',
      selectedServices: [],
      price: '',
    });
    setSelectedCompany('');
    setSelectedModel('');
    setVehicleSearchQuery('');
    setIsManualEntry(false);
    setErrors({});
    setSaveSuccess(false);
  };

  const [toastData, setToastData] = useState<{ title: string; detail: string } | null>(null);
  const [showWhatsAppSettingsModal, setShowWhatsAppSettingsModal] = useState(false);

  const showToast = (title: string, detail: string) => {
    setToastData({ title, detail });
    setTimeout(() => setToastData(null), 4000);
  };

  const handleVehicleReceived = async () => {
    if (!validateForm()) return;

    const saved = await handleSaveDraft();
    if (saved) {
      const res = await sendVehicleReceivedWhatsAppViaBackend(saved);
      if (res.success) {
        showToast('MESSAGE SENT THROUGH LINKED WHATSAPP', `Vehicle Received alert sent to ${saved.phoneNumber}`);
      } else {
        showToast('⚠️ WHATSAPP NOT CONNECTED', res.error || 'Please link your WhatsApp device in Settings.');
        setShowWhatsAppSettingsModal(true);
      }
    }
  };

  const handleVehicleReady = async () => {
    if (!validateForm()) return;

    const saved = await handleSaveDraft();
    if (saved) {
      const res = await sendVehicleReadyWhatsAppViaBackend(saved);
      if (res.success) {
        showToast('MESSAGE SENT THROUGH LINKED WHATSAPP', `Vehicle Ready alert sent to ${saved.phoneNumber}`);
      } else {
        showToast('⚠️ WHATSAPP NOT CONNECTED', res.error || 'Please link your WhatsApp device in Settings.');
        setShowWhatsAppSettingsModal(true);
      }
    }
  };

  const handleTextMessage = async () => {
    if (!validateForm()) return;

    const saved = await handleSaveDraft();
    const cleanPhone = (saved?.phoneNumber || formData.phoneNumber).replace(/\D/g, '');
    const priceNum = parsePriceNumber(saved?.price || formData.price);
    const discountNum = saved?.discount ? parsePriceNumber(saved.discount) : 0;
    const finalAmount = Math.max(0, priceNum - discountNum);
    const servicesText = Array.isArray(saved?.services)
      ? saved.services.join(', ')
      : formData.selectedServices.join(', ');
    const billNo = saved ? (saved.billNo || generateBillNo(saved.id, saved.createdAt)) : '';

    const templates = getMessageTemplates();
    const msg = renderTemplate(templates.sms, {
      customer_name: saved?.customerName || formData.customerName,
      vehicle_model: saved?.vehicleName || formData.vehicleName,
      vehicle_number: saved?.vehicleNumber || formData.vehicleNumber,
      service: servicesText,
      amount: finalAmount,
      bill_no: billNo,
      shop_name: SHOP_NAME,
    });

    const smsUrl = `sms:+91${cleanPhone}?body=${encodeURIComponent(msg)}`;
    window.open(smsUrl, '_blank');
  };

  const handleBillWhatsApp = async () => {
    if (!validateForm()) return;

    const saved = await handleSaveDraft();
    if (saved) {
      setCurrentInvoiceRecord(saved);
      setShowInvoiceModal(true);
      const res = await sendWhatsAppBillViaBackend(saved);
      if (res.success) {
        showToast('BILL SENT THROUGH LINKED WHATSAPP', `PDF Tax Invoice sent to ${saved.phoneNumber}`);
      } else {
        showToast('⚠️ WHATSAPP NOT CONNECTED', res.error || 'Please link your WhatsApp device in Settings.');
        setShowWhatsAppSettingsModal(true);
      }
    }
  };

  const hasEnteredData = Boolean(
    formData.vehicleNumber ||
      formData.customerName ||
      formData.phoneNumber ||
      formData.vehicleName ||
      formData.location ||
      formData.selectedServices.length > 0 ||
      formData.price
  );

  const currentStaff = getCurrentStaff();
  const targetTodayPath = mode === 'owner' ? '/owner/today' : '/staff/today';

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
      {/* HEADER */}
      <Header
        mode={mode}
        onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
      />

      {/* NAVIGATION DRAWER */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={mode}
        deferredPrompt={deferredPrompt}
        onInstallApp={onInstallApp}
      />

      {/* MAIN JOB SHEET FORM - RESPONSIVE NATURAL VERTICAL SCROLL */}
      <main className="flex-1 px-3.5 py-3 sm:px-6 sm:py-4 max-w-lg mx-auto w-full pb-8 space-y-3.5">
        {/* PAGE TITLE & STATUS HEADER */}
        <section className="flex items-center justify-between gap-3 pt-0.5 pb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            {isEditing && (
              <button
                onClick={() => navigate(targetTodayPath)}
                className="p-1 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-neutral-900 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Back to today's vehicles"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
              {isEditing ? 'Edit Vehicle Job' : "Today's Job Sheet"}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && hasEnteredData && (
              <button
                type="button"
                onClick={handleResetForm}
                className="text-xs font-bold text-slate-700 dark:text-neutral-200 hover:text-rose-600 dark:hover:text-rose-400 bg-white dark:bg-[#121212] border border-slate-300 dark:border-neutral-800 hover:border-rose-300 dark:hover:border-rose-800 px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs leading-none"
                title="Clear all input fields"
              >
                <RotateCcw size={13} className="text-slate-500 dark:text-neutral-400" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            {/* MODE BADGE ON RIGHT */}
            <div className="px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide uppercase border bg-slate-200/80 dark:bg-neutral-900 text-slate-800 dark:text-neutral-200 border-slate-300 dark:border-neutral-800 shadow-2xs leading-none select-none">
              {mode === 'owner'
                ? 'Owner Mode'
                : currentStaff?.staff_name
                  ? `Staff: ${currentStaff.staff_name.toUpperCase()}`
                  : 'Staff Mode'}
            </div>
          </div>
        </section>

        {/* SUCCESS ALERT */}
        {saveSuccess && (
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-2 text-xs">
            <CheckCircle2 size={16} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span className="font-bold text-emerald-900 dark:text-emerald-200">
              Job saved as draft ✓ synchronized to cloud
            </span>
          </div>
        )}

        {/* FORM CONTAINER */}
        <form onSubmit={handleSaveDraft} className="space-y-4">
          
          {/* 1. VEHICLE & CUSTOMER DETAILS SECTION (MERGED) */}
          <section className="bg-white dark:bg-[#0A0A0A] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-neutral-850 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-850 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 flex items-center justify-center text-xs">
                  <Car size={14} />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  Vehicle & Customer Details
                </span>
              </div>
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md">
                Required
              </span>
            </div>

            {/* Vehicle Number Input (High-contrast Indian Registration Plate design) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Vehicle Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex rounded-xl border-2 border-slate-300 dark:border-neutral-800 focus-within:border-slate-900 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 bg-slate-50 dark:bg-[#050505] shadow-inner overflow-hidden transition-all">
                {/* Country / IND Emblem Strip */}
                <div className="w-9 bg-[#002B7F] flex flex-col items-center justify-center py-2 text-white border-r border-blue-900 select-none">
                  <span className="text-[10px] text-amber-300 leading-none mb-0.5">☸</span>
                  <span className="text-[9px] font-black tracking-tighter">IND</span>
                </div>
                <input
                  type="text"
                  value={formData.vehicleNumber}
                  onChange={(e) => handleChange('vehicleNumber', e.target.value.toUpperCase())}
                  placeholder="MH 02 EQ 8899"
                  className="w-full bg-transparent border-none py-3 px-3 text-base md:text-lg font-mono font-black tracking-widest uppercase text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 focus:ring-0 focus:outline-none"
                  required
                />
              </div>
              {errors.vehicleNumber && (
                <p className="text-[10px] sm:text-[11px] font-semibold text-rose-500 mt-1">
                  {errors.vehicleNumber}
                </p>
              )}
            </div>

            {/* Customer Name Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-xs focus-within:border-slate-900 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-neutral-400">
                  <User size={15} />
                </span>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => handleChange('customerName', e.target.value)}
                  placeholder="e.g. Vikramaditya Sharma"
                  className="w-full rounded-xl border-none pl-10 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:ring-0 focus:outline-none bg-transparent"
                  required
                />
              </div>
              {errors.customerName && (
                <p className="text-[10px] sm:text-[11px] font-semibold text-rose-500 mt-1">
                  {errors.customerName}
                </p>
              )}
            </div>

            {/* Phone Number Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-xs focus-within:border-slate-900 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all overflow-hidden">
                <div className="flex items-center gap-1 px-3 bg-slate-100 dark:bg-neutral-900 border-r border-slate-300 dark:border-neutral-800 text-xs font-bold text-slate-800 dark:text-neutral-200 select-none">
                  <span className="text-sm">🇮🇳</span>
                  <span>+91</span>
                </div>
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  placeholder="98765 43210"
                  className="w-full border-none py-2.5 px-3.5 text-sm font-semibold tracking-wide text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:ring-0 focus:outline-none bg-transparent"
                  required
                />
                <div className="pr-3 flex items-center text-slate-400 dark:text-neutral-400">
                  <Phone size={14} />
                </div>
              </div>
              {errors.phoneNumber && (
                <p className="text-[10px] sm:text-[11px] font-semibold text-rose-500 mt-1">
                  {errors.phoneNumber}
                </p>
              )}
            </div>

            {/* Quick Search Filter Bar */}
            <div className="relative pt-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-neutral-400 pt-1">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={vehicleSearchQuery}
                onChange={(e) => setVehicleSearchQuery(e.target.value)}
                placeholder="Quick search model (e.g. Nexon, Thar, Creta)..."
                className="w-full rounded-xl border border-slate-300 dark:border-neutral-800 bg-slate-50 dark:bg-[#121212] pl-9 pr-7 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-[#121212] focus:border-slate-900 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
              />
              {vehicleSearchQuery && (
                <button
                  type="button"
                  onClick={() => setVehicleSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}

              {/* SEARCH RESULTS DROPDOWN */}
              {vehicleSearchQuery.trim() !== '' && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white dark:bg-[#121212] border border-slate-300 dark:border-neutral-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                  {searchedModels.length > 0 ? (
                    searchedModels.map((item) => (
                      <button
                        type="button"
                        key={`${item.company}-${item.model}`}
                        onClick={() => {
                          setSelectedCompany(item.company);
                          setSelectedModel(item.model);
                          setIsManualEntry(false);
                          handleChange('vehicleName', `${item.company} ${item.model}`);
                          setVehicleSearchQuery('');
                        }}
                        className="w-full px-3 py-2 text-left rounded-lg text-xs font-bold text-slate-900 dark:text-white hover:bg-amber-50 dark:hover:bg-neutral-800 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span>{item.company} <span className="font-extrabold text-amber-600 dark:text-amber-400">{item.model}</span></span>
                        <span className="text-[10px] text-slate-500 dark:text-neutral-400 uppercase font-semibold">{item.company}</span>
                      </button>
                    ))
                  ) : (
                    <div className="py-2.5 text-center text-xs text-slate-500 dark:text-neutral-400">
                      No matching models found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cascading Selectors: Company & Model in Grid */}
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              {/* Company Selection */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-tight">
                  Company <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedCompany}
                    onChange={(e) => {
                      const comp = e.target.value;
                      setSelectedCompany(comp);
                      setSelectedModel('');
                      if (comp === 'Other') {
                        setIsManualEntry(true);
                        handleChange('vehicleName', '');
                      } else if (comp) {
                        setIsManualEntry(false);
                        handleChange('vehicleName', comp);
                      } else {
                        setIsManualEntry(false);
                        handleChange('vehicleName', '');
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] py-2.5 pl-3 pr-8 text-xs font-bold text-slate-900 dark:text-white appearance-none focus:border-slate-900 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-xs transition-all truncate cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-black text-slate-900 dark:text-white">— Select Make —</option>
                    {INDIAN_VEHICLE_BRANDS.map((b) => (
                      <option key={b.company} value={b.company} className="bg-white dark:bg-black text-slate-900 dark:text-white">
                        {b.company}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    <ChevronDown size={14} />
                  </span>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-tight">
                  Model <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    disabled={!selectedCompany || selectedCompany === 'Other'}
                    value={selectedModel}
                    onChange={(e) => {
                      const mod = e.target.value;
                      setSelectedModel(mod);
                      if (mod) {
                        handleChange('vehicleName', `${selectedCompany} ${mod}`);
                      } else {
                        handleChange('vehicleName', selectedCompany);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] py-2.5 pl-3 pr-8 text-xs font-bold text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-neutral-900 disabled:text-slate-400 disabled:cursor-not-allowed appearance-none focus:border-slate-900 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 shadow-xs transition-all truncate cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-black text-slate-900 dark:text-white">
                      {!selectedCompany
                        ? '— Select Model —'
                        : selectedCompany === 'Other'
                        ? '— Manual Entry —'
                        : '— Select Model —'}
                    </option>
                    {selectedCompany &&
                      selectedCompany !== 'Other' &&
                      INDIAN_VEHICLE_BRANDS.find((b) => b.company === selectedCompany)?.models.map((mod) => (
                        <option key={mod} value={mod} className="bg-white dark:bg-black text-slate-900 dark:text-white">
                          {mod}
                        </option>
                      ))}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    <ChevronDown size={14} />
                  </span>
                </div>
              </div>
            </div>

            {/* MANUAL ENTRY INPUT */}
            {isManualEntry && (
              <input
                type="text"
                value={formData.vehicleName}
                onChange={(e) => handleChange('vehicleName', e.target.value)}
                placeholder="Custom vehicle name (e.g. BMW X5)..."
                className="w-full min-h-[40px] px-3 bg-white dark:bg-[#121212] border border-slate-300 dark:border-neutral-800 rounded-xl text-xs text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                autoFocus
              />
            )}

            {/* Location Input */}
            <div className="space-y-1.5 pt-0.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Location
              </label>
              <div className="relative rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-xs focus-within:border-slate-900 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-neutral-400">
                  <MapPin size={15} />
                </span>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  placeholder="e.g. Wash Bay 02 / Detailing Booth A"
                  className="w-full rounded-xl border-none pl-10 pr-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:ring-0 focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Primary Package / Service Selection */}
            <div className="space-y-1.5 relative pt-0.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Primary Package / Service <span className="text-rose-500">*</span>
              </label>

              <button
                type="button"
                onClick={() => setShowDropdownPicker(!showDropdownPicker)}
                className={`w-full min-h-[42px] px-3.5 py-2.5 bg-white dark:bg-[#121212] border ${
                  errors.services ? 'border-rose-500' : 'border-slate-300 dark:border-neutral-800'
                } rounded-xl text-xs sm:text-sm font-bold text-left flex items-center justify-between cursor-pointer shadow-xs focus:ring-2 focus:ring-amber-400/20`}
              >
                <span className="truncate text-slate-900 dark:text-white">
                  {formData.selectedServices.length > 0
                    ? `${formData.selectedServices.length} Selected (${formData.selectedServices.join(', ')})`
                    : 'Choose a package or service...'}
                </span>
                <ChevronDown size={15} className="text-slate-400 shrink-0 ml-1" />
              </button>

              {/* BACKDROP TO DISMISS DROPDOWN */}
              {showDropdownPicker && (
                <div
                  className="fixed inset-0 z-30 bg-transparent"
                  onClick={() => setShowDropdownPicker(false)}
                />
              )}

              {/* SERVICES POPUP MENU */}
              {showDropdownPicker && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-[#0F0F0F] border border-slate-300 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-64">
                  <div className="p-2 border-b border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-[#141414] flex items-center gap-2">
                    <div className="relative flex-1 flex items-center">
                      <Search size={14} className="absolute left-3 text-slate-400" />
                      <input
                        type="text"
                        value={serviceSearchQuery}
                        onChange={(e) => setServiceSearchQuery(e.target.value)}
                        placeholder="Search services..."
                        className="w-full min-h-[36px] pl-9 pr-7 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-neutral-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                      />
                      {serviceSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setServiceSearchQuery('')}
                          className="absolute right-2 text-slate-400 hover:text-slate-700 p-1"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDropdownPicker(false)}
                      className="px-3 min-h-[36px] bg-slate-950 dark:bg-amber-400 text-white dark:text-black text-xs font-bold rounded-xl cursor-pointer shrink-0"
                    >
                      Done
                    </button>
                  </div>

                  <div className="p-1.5 space-y-0.5 overflow-y-auto max-h-48">
                    {filteredServices.length > 0 ? (
                      filteredServices.map((serviceName) => {
                        const isSelected = formData.selectedServices.includes(serviceName);
                        return (
                          <button
                            type="button"
                            key={serviceName}
                            onClick={() => handleToggleService(serviceName)}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                                : 'text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-neutral-800'
                            }`}
                          >
                            <span className="truncate">{serviceName}</span>
                            {isSelected && <Check size={15} className="text-slate-950 shrink-0 ml-1" />}
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-2.5 text-center text-xs text-slate-500 dark:text-neutral-400">
                        No services found
                      </div>
                    )}
                  </div>
                </div>
              )}

              {errors.services && (
                <p className="text-[10px] sm:text-[11px] font-semibold text-rose-500 mt-1">
                  {errors.services}
                </p>
              )}
            </div>

            {/* Quick Service Chips (Fast Selection) */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700 dark:text-neutral-300">
                Quick Service Chips:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {['Full Foam Wash', 'Interior Deep Clean', 'Engine Bay Cleaning', 'Wax Polish', 'Underbody Wash'].map((quickName) => {
                  const isSelected = formData.selectedServices.includes(quickName);
                  return (
                    <button
                      key={quickName}
                      type="button"
                      onClick={() => handleToggleService(quickName)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 border-amber-500 font-black shadow-xs'
                          : 'bg-slate-100 dark:bg-[#141414] text-slate-800 dark:text-neutral-200 hover:bg-slate-200 dark:hover:bg-neutral-800 border-slate-300 dark:border-neutral-800 font-bold'
                      }`}
                    >
                      {isSelected ? `✓ ${quickName}` : `+ ${quickName}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Service Pills */}
            {formData.selectedServices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {formData.selectedServices.map((srvName) => (
                  <span
                    key={srvName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 rounded-lg text-[11px] font-bold text-amber-950 dark:text-amber-300 shadow-2xs"
                  >
                    <Check size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{srvName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveService(srvName)}
                      className="text-amber-800 dark:text-amber-400 hover:text-rose-500 dark:hover:text-rose-400 p-0.5 cursor-pointer ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Price & Currency Input */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
                Total Amount (INR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex rounded-xl border border-slate-300 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-xs focus-within:border-slate-900 dark:focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition-all overflow-hidden">
                <span className="inline-flex items-center px-4 bg-slate-100 dark:bg-[#181818] border-r border-slate-300 dark:border-neutral-800 text-slate-900 dark:text-amber-400 font-black text-base">
                  ₹
                </span>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  placeholder="0.00"
                  className="w-full border-none py-3 px-3.5 text-base font-black font-mono text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:ring-0 focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  required
                />
                <div className="pr-3.5 flex items-center text-xs font-bold text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 my-1.5 mr-2 px-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30">
                  <span>INC. TAX</span>
                </div>
              </div>
              {errors.price && (
                <p className="text-[10px] sm:text-[11px] font-semibold text-rose-500 mt-1">
                  {errors.price}
                </p>
              )}
            </div>
          </section>

          {/* 4. QUICK TRIGGERS & UPDATES */}
          <section className="space-y-2.5 pt-1.5" data-purpose="status-and-messaging-actions">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-900 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Quick Triggers & Instant Updates
              </span>
              <span className="text-[10px] font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-tight bg-slate-200/80 dark:bg-neutral-900 px-2 py-0.5 rounded-md border border-slate-300/80 dark:border-neutral-800">
                1-Tap Actions
              </span>
            </div>

            {/* 2x2 High-Impact Bold Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              {/* Action 1: Vehicle Received */}
              <button
                type="button"
                onClick={handleVehicleReceived}
                className="relative overflow-hidden flex items-center gap-2.5 p-3 rounded-2xl text-white shadow-lg transition-all active:scale-[0.96] group border-2 border-[#34D399] bg-[#059669] hover:bg-[#047857] text-left cursor-pointer"
                title="Send Vehicle Received WhatsApp Alert"
              >
                <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                  <CheckCircle2 size={22} className="text-white drop-shadow-md" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-black tracking-wide uppercase leading-tight truncate text-white">
                    Vehicle Received
                  </span>
                  <span className="block text-[10px] font-black text-emerald-100 uppercase tracking-tight mt-0.5">
                    WhatsApp Alert
                  </span>
                </div>
              </button>

              {/* Action 2: Vehicle Ready */}
              <button
                type="button"
                onClick={handleVehicleReady}
                className="relative overflow-hidden flex items-center gap-2.5 p-3 rounded-2xl text-white shadow-lg transition-all active:scale-[0.96] group border-2 border-[#34D399] bg-[#059669] hover:bg-[#047857] text-left cursor-pointer"
                title="Send Vehicle Ready WhatsApp Alert"
              >
                <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm text-xl">
                  🚗
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-black tracking-wide uppercase leading-tight truncate text-white">
                    Vehicle Ready
                  </span>
                  <span className="block text-[10px] font-black text-emerald-100 uppercase tracking-tight mt-0.5">
                    Customer Alert
                  </span>
                </div>
              </button>

              {/* Action 3: Text SMS */}
              <button
                type="button"
                onClick={handleTextMessage}
                className="relative overflow-hidden flex items-center gap-2.5 p-3 rounded-2xl text-white shadow-lg transition-all active:scale-[0.96] group border-2 border-[#60A5FA] bg-[#2563EB] hover:bg-[#1D4ED8] text-left cursor-pointer"
                title="Send SMS Text Message"
              >
                <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                  <SmsIcon className="w-6 h-6 text-white drop-shadow-md" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-black tracking-wide uppercase leading-tight truncate text-white">
                    Text SMS
                  </span>
                  <span className="block text-[10px] font-black text-blue-100 uppercase tracking-tight mt-0.5">
                    Direct Message
                  </span>
                </div>
              </button>

              {/* Action 4: WhatsApp Bill */}
              <button
                type="button"
                onClick={handleBillWhatsApp}
                className="relative overflow-hidden flex items-center gap-2.5 p-3 rounded-2xl text-white shadow-lg transition-all active:scale-[0.96] group border-2 border-[#86EFAC] bg-[#25D366] hover:bg-[#1EBE5D] text-left cursor-pointer"
                title="Send PDF Invoice on WhatsApp"
              >
                <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                  <WhatsAppIcon className="w-6 h-6 text-white drop-shadow-md" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-black tracking-wide uppercase leading-tight truncate text-white">
                    WhatsApp Bill
                  </span>
                  <span className="block text-[10px] font-black text-emerald-100 uppercase tracking-tight mt-0.5">
                    PDF Tax Invoice
                  </span>
                </div>
              </button>
            </div>
          </section>

          {/* 5. PRIMARY SAVE ACTION BUTTON */}
          <div className="pt-2 pb-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-slate-950 hover:bg-black dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-black font-black text-sm tracking-wide shadow-lg active:scale-[0.99] transition-all border border-slate-800 dark:border-amber-300 cursor-pointer"
            >
              <Save size={18} className="text-amber-400 dark:text-black" />
              <span>{isEditing ? 'UPDATE JOB SHEET' : 'SAVE DRAFT & CREATE JOB'}</span>
            </button>
          </div>
        </form>
      </main>

      {/* SUCCESS MODAL POPUP */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowSuccessPopup(false)}
          />
          <div className="relative z-10 w-full max-w-xs bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-5 text-center animate-scale-up transition-colors">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-2">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
              {isEditing ? 'Job Updated Successfully!' : 'Job Saved Successfully!'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
              Vehicle <span className="font-bold text-slate-900 dark:text-white">{savedVehNum}</span> has been saved to Today&apos;s Vehicles list.
            </p>

            <div className="mt-4 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessPopup(false);
                  navigate(targetTodayPath);
                }}
                className="w-full h-9 bg-slate-950 dark:bg-white text-white dark:text-black font-bold rounded-xl text-[11px] uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] transition-all cursor-pointer"
              >
                Go to Today&apos;s Vehicles List →
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSuccessPopup(false);
                  handleResetForm();
                  if (isEditing) {
                    navigate(mode === 'owner' ? '/owner' : '/staff');
                  }
                }}
                className="w-full h-9 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-bold rounded-xl text-[11px] uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-all cursor-pointer"
              >
                + Add Another Vehicle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LATEX-MATCHED INVOICE & PRINT MODAL */}
      {showInvoiceModal && currentInvoiceRecord && (
        <InvoiceModal
          record={currentInvoiceRecord}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      {/* LINKED WHATSAPP SENT FLOATING TOAST */}
      {toastData && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white border-l-4 border-[#25D366] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in max-w-[90vw]">
          <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-[#25D366]" />
          </div>
          <div>
            <p className="font-extrabold text-xs tracking-wider uppercase text-[#25D366]">
              {toastData.title}
            </p>
            <p className="text-[11px] text-neutral-300 font-medium mt-0.5">{toastData.detail}</p>
          </div>
        </div>
      )}
      {/* LINKED WHATSAPP DEVICE MODAL */}
      <WhatsAppSettingsModal
        isOpen={showWhatsAppSettingsModal}
        onClose={() => setShowWhatsAppSettingsModal(false)}
      />
    </div>
  );
};

