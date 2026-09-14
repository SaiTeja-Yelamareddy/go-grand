import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Menu,
  RotateCcw,
  CheckCircle2,
  X,
  Check,
  ChevronDown,
  Save,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { NavigationDrawer } from './NavigationDrawer';
import { ThemeToggle } from './ThemeToggle';
import { saveJobRecord, updateJobRecord, getJobRecordById, type JobRecord } from '../utils/draftStorage';
import { INDIAN_VEHICLE_BRANDS } from '../data/indianVehicles';
import { InvoiceModal } from './InvoiceModal';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { sendWhatsAppBillViaBackend, sendVehicleReadyWhatsAppViaBackend, sendVehicleReceivedWhatsAppViaBackend } from '../utils/invoiceUtils';

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

    await handleSaveDraft();

    const cleanPhone = formData.phoneNumber.replace(/\D/g, '');
    const vehicleNo = formData.vehicleNumber.toUpperCase();
    const custName = formData.customerName;
    const servicesText = formData.selectedServices.join(', ');

    const msg = `Hello ${custName}, regarding your vehicle ${vehicleNo} (${servicesText}) at GO GRAND Car Wash.`;

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
    <div className="w-full min-h-0 h-auto bg-[#F7F7F7] text-[#111111] flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E5E5E5] px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between shadow-2xs w-full max-w-full">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg text-[#111111] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <img src="/logo.png" alt="GO GRAND" className="h-8 sm:h-9 object-contain rounded-lg shadow-2xs shrink-0" />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base leading-none tracking-tight text-[#111111] uppercase truncate">
                GO GRAND
              </h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#333333] tracking-wider uppercase leading-none mt-0.5 truncate">
                CAR WASH & DETAILING
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <div className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border uppercase bg-[#F7F7F7] text-[#111111] border-[#E5E5E5]">
            {mode === 'owner'
              ? 'Owner Mode'
              : currentStaff?.staff_name
              ? `STAFF: ${currentStaff.staff_name.toUpperCase()}`
              : 'Staff Mode'}
          </div>
        </div>
      </header>

      {/* NAVIGATION DRAWER */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={mode}
        deferredPrompt={deferredPrompt}
        onInstallApp={onInstallApp}
      />

      {/* MAIN JOB SHEET FORM - RESPONSIVE NATURAL VERTICAL SCROLL */}
      <main className="flex-1 px-3.5 py-3 sm:px-6 sm:py-5 max-w-lg mx-auto w-full pb-6">
        {/* PAGE TITLE BAR */}
        <div className="flex items-center justify-between mb-2.5 sm:mb-3 shrink-0">
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={() => navigate(targetTodayPath)}
                className="p-1 rounded-md text-[#111111] hover:bg-[#E5E5E5] flex items-center justify-center cursor-pointer"
                aria-label="Back to today's vehicles"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-base sm:text-xl font-black text-[#111111] tracking-tight">
                {isEditing ? 'Edit Vehicle Job' : "Today's Job Sheet"}
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-[#666666] mt-0.5">
                {isEditing ? 'Modify job details' : 'Enter vehicle & service details'}
              </p>
            </div>
          </div>

          {!isEditing && hasEnteredData && (
            <button
              onClick={handleResetForm}
              className="text-xs font-bold text-[#666666] hover:text-[#111111] bg-white border border-[#E5E5E5] px-2.5 py-1 rounded-lg flex items-center gap-1.5 min-h-[30px] transition-colors cursor-pointer shadow-2xs"
              title="Clear input fields for a new job"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* SUCCESS ALERT */}
        {saveSuccess && (
          <div className="shrink-0 mb-3 p-2.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center gap-2 text-xs">
            <CheckCircle2 size={16} className="text-[#166534] shrink-0" />
            <span className="font-bold text-[#166534]">Job saved as draft ✓ preserved locally</span>
          </div>
        )}

        {/* FORM CONTAINER - STACKED IN EXACT SPECIFIED ORDER */}
        <form onSubmit={handleSaveDraft} className="space-y-2.5 sm:space-y-3">
          
          {/* 1. VEHICLE NUMBER */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Vehicle Number <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.vehicleNumber}
              onChange={(e) => handleChange('vehicleNumber', e.target.value.toUpperCase())}
              placeholder="[ Enter vehicle number ]"
              className={`w-full min-h-[42px] sm:min-h-[46px] px-3 bg-white border ${
                errors.vehicleNumber ? 'border-red-500' : 'border-[#E5E5E5]'
              } rounded-xl text-xs sm:text-sm text-[#111111] font-bold uppercase placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all`}
            />
            {errors.vehicleNumber && (
              <p className="text-[10px] sm:text-[11px] font-medium text-red-600 mt-1">
                {errors.vehicleNumber}
              </p>
            )}
          </div>

          {/* 2. CUSTOMER NAME */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Customer Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
              placeholder="[ Enter customer name ]"
              className={`w-full min-h-[42px] sm:min-h-[46px] px-3 bg-white border ${
                errors.customerName ? 'border-red-500' : 'border-[#E5E5E5]'
              } rounded-xl text-xs sm:text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all`}
            />
            {errors.customerName && (
              <p className="text-[10px] sm:text-[11px] font-medium text-red-600 mt-1">
                {errors.customerName}
              </p>
            )}
          </div>

          {/* 3. PHONE NUMBER */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Phone Number <span className="text-red-600">*</span>
            </label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => handleChange('phoneNumber', e.target.value)}
              placeholder="[ Enter phone number ]"
              className={`w-full min-h-[42px] sm:min-h-[46px] px-3 bg-white border ${
                errors.phoneNumber ? 'border-red-500' : 'border-[#E5E5E5]'
              } rounded-xl text-xs sm:text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all`}
            />
            {errors.phoneNumber && (
              <p className="text-[10px] sm:text-[11px] font-medium text-red-600 mt-1">
                {errors.phoneNumber}
              </p>
            )}
          </div>

          {/* 4. VEHICLE DETAILS */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider">
                Vehicle Details
              </label>
              {formData.vehicleName && (
                <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200 truncate max-w-[200px]">
                  {formData.vehicleName}
                </span>
              )}
            </div>

            {/* QUICK SEARCH MODEL */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search size={15} className="absolute left-3 text-[#999999]" />
                <input
                  type="text"
                  value={vehicleSearchQuery}
                  onChange={(e) => setVehicleSearchQuery(e.target.value)}
                  placeholder="Quick search model (e.g. Nexon, Thar, Creta)..."
                  className="w-full min-h-[40px] pl-9 pr-7 bg-[#F7F7F7] border border-[#E5E5E5] rounded-xl text-xs font-medium text-[#111111] placeholder-[#666666] focus:outline-none focus:border-[#111111]"
                />
                {vehicleSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setVehicleSearchQuery('')}
                    className="absolute right-2 text-[#999999] hover:text-[#111111] p-1 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* SEARCH RESULTS DROPDOWN */}
              {vehicleSearchQuery.trim() !== '' && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-[#E5E5E5] rounded-xl shadow-xl max-h-48 overflow-y-auto p-1.5 space-y-1">
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
                        className="w-full px-3 py-1.5 text-left rounded-lg text-xs font-semibold text-[#111111] hover:bg-[#F7F7F7] flex items-center justify-between cursor-pointer"
                      >
                        <span>{item.company} <span className="font-bold">{item.model}</span></span>
                        <span className="text-[10px] text-[#666666] uppercase">{item.company}</span>
                      </button>
                    ))
                  ) : (
                    <div className="py-2 text-center text-xs text-[#666666]">
                      No matching models found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SELECT COMPANY */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold text-[#666666] uppercase tracking-wider mb-1">
                Select Company ▼
              </label>
              <div className="relative flex items-center">
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
                  className="w-full min-h-[40px] pl-3 pr-9 bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] appearance-none focus:outline-none focus:border-[#111111] cursor-pointer"
                >
                  <option value="">– Select Company –</option>
                  {INDIAN_VEHICLE_BRANDS.map((b) => (
                    <option key={b.company} value={b.company}>
                      {b.company}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 pointer-events-none text-[#666666]">
                  <ChevronDown size={15} />
                </div>
              </div>
            </div>

            {/* SELECT VEHICLE MODEL */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold text-[#666666] uppercase tracking-wider mb-1">
                Select Vehicle Model ▼
              </label>
              <div className="relative flex items-center">
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
                  className="w-full min-h-[40px] pl-3 pr-9 bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] disabled:bg-[#F7F7F7] disabled:text-[#999999] disabled:cursor-not-allowed appearance-none focus:outline-none focus:border-[#111111] cursor-pointer"
                >
                  <option value="">
                    {!selectedCompany
                      ? '– Select Company First –'
                      : selectedCompany === 'Other'
                      ? '– Manual Entry Below –'
                      : '– Select Model –'}
                  </option>
                  {selectedCompany &&
                    selectedCompany !== 'Other' &&
                    INDIAN_VEHICLE_BRANDS.find((b) => b.company === selectedCompany)?.models.map((mod) => (
                      <option key={mod} value={mod}>
                        {mod}
                      </option>
                    ))}
                </select>
                <div className="absolute right-3 pointer-events-none text-[#666666]">
                  <ChevronDown size={15} />
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
                className="w-full min-h-[40px] px-3 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111]"
                autoFocus
              />
            )}
          </div>

          {/* 5. LOCATION */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="[ Enter location ]"
              className="w-full min-h-[42px] sm:min-h-[46px] px-3 bg-white border border-[#E5E5E5] rounded-xl text-xs sm:text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all"
            />
          </div>

          {/* 6. SERVICES */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs relative">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Services <span className="text-red-600">*</span>
            </label>

            <button
              type="button"
              onClick={() => setShowDropdownPicker(!showDropdownPicker)}
              className={`w-full min-h-[42px] sm:min-h-[46px] px-3 bg-white border ${
                errors.services ? 'border-red-500' : 'border-[#E5E5E5]'
              } rounded-xl text-xs sm:text-sm font-semibold text-left flex items-center justify-between cursor-pointer`}
            >
              <span className="truncate">
                {formData.selectedServices.length > 0
                  ? `${formData.selectedServices.length} Selected`
                  : 'Select Service'}
              </span>
              <ChevronDown size={15} className="text-[#666666] shrink-0 ml-0.5" />
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
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-[#E5E5E5] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-60">
                <div className="p-2 border-b border-[#E5E5E5] bg-white flex items-center gap-2">
                  <div className="relative flex-1 flex items-center">
                    <Search size={14} className="absolute left-3 text-[#999999]" />
                    <input
                      type="text"
                      value={serviceSearchQuery}
                      onChange={(e) => setServiceSearchQuery(e.target.value)}
                      placeholder="Search services..."
                      className="w-full min-h-[36px] pl-9 pr-7 bg-[#F7F7F7] border border-[#E5E5E5] rounded-xl text-xs font-medium text-[#111111] placeholder-[#666666] focus:outline-none"
                    />
                    {serviceSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setServiceSearchQuery('')}
                        className="absolute right-2 text-[#999999] hover:text-[#111111] p-1"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDropdownPicker(false)}
                    className="px-3 min-h-[36px] bg-[#111111] text-white text-xs font-bold rounded-xl cursor-pointer shrink-0"
                  >
                    Done
                  </button>
                </div>

                <div className="p-1.5 space-y-0.5 overflow-y-auto max-h-44">
                  {filteredServices.length > 0 ? (
                    filteredServices.map((serviceName) => {
                      const isSelected = formData.selectedServices.includes(serviceName);
                      return (
                        <button
                          type="button"
                          key={serviceName}
                          onClick={() => handleToggleService(serviceName)}
                          className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#111111] text-white'
                              : 'text-[#111111] hover:bg-[#F7F7F7]'
                          }`}
                        >
                          <span className="truncate">{serviceName}</span>
                          {isSelected && <Check size={15} className="text-white shrink-0 ml-1" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-2.5 text-center text-xs text-[#666666]">
                      No services found
                    </div>
                  )}
                </div>
              </div>
            )}

            {errors.services && (
              <p className="text-[10px] sm:text-[11px] font-medium text-red-600 mt-1">
                {errors.services}
              </p>
            )}

            {/* SERVICE CHIPS */}
            {formData.selectedServices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {formData.selectedServices.map((srvName) => (
                  <span
                    key={srvName}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg text-[11px] font-bold text-[#111111] shadow-2xs"
                  >
                    <Check size={12} className="text-green-700" />
                    <span>{srvName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveService(srvName)}
                      className="text-[#666666] hover:text-red-600 p-0.5 cursor-pointer ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 7. PRICE */}
          <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E5E5] shadow-xs">
            <label className="block text-[11px] sm:text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5 truncate">
              Price <span className="text-red-600">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs sm:text-sm font-bold text-[#111111]">
                ₹
              </span>
              <input
                type="text"
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value)}
                placeholder="0"
                className={`w-full min-h-[42px] sm:min-h-[46px] pl-7 pr-3 bg-white border ${
                  errors.price ? 'border-red-500' : 'border-[#E5E5E5]'
                } rounded-xl text-xs sm:text-sm text-[#111111] font-bold placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all`}
              />
            </div>
            {errors.price && (
              <p className="text-[10px] sm:text-[11px] font-medium text-red-600 mt-1">
                {errors.price}
              </p>
            )}
          </div>

          {/* BOTTOM ACTION BUTTONS */}
          <div className="space-y-2.5 pt-2">
            {/* 4 QUICK ACTION BUTTONS */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={handleVehicleReceived}
                disabled={!formData.phoneNumber.trim()}
                className={`w-full min-h-[48px] sm:min-h-[50px] px-3 py-2.5 bg-[#1A1A1A] border border-[#2E2E2E] hover:bg-[#262626] active:bg-[#141414] hover:border-[#404040] rounded-[15px] text-[11px] sm:text-xs font-black text-[#FFFFFF] uppercase tracking-wider flex items-center justify-center gap-2 sm:gap-2.5 text-center shadow-xs transition-all ${
                  !formData.phoneNumber.trim()
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-sm'
                }`}
                title={!formData.phoneNumber.trim() ? 'Enter Customer Phone Number' : 'Send Vehicle Received WhatsApp Alert'}
              >
                <WhatsAppIcon className="w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] text-[#25D366] shrink-0" />
                <span className="truncate">Vehicle Received</span>
              </button>

              <button
                type="button"
                onClick={handleVehicleReady}
                disabled={!formData.phoneNumber.trim()}
                className={`w-full min-h-[48px] sm:min-h-[50px] px-3 py-2.5 bg-[#1A1A1A] border border-[#2E2E2E] hover:bg-[#262626] active:bg-[#141414] hover:border-[#404040] rounded-[15px] text-[11px] sm:text-xs font-black text-[#FFFFFF] uppercase tracking-wider flex items-center justify-center gap-2 sm:gap-2.5 text-center shadow-xs transition-all ${
                  !formData.phoneNumber.trim()
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-sm'
                }`}
                title={!formData.phoneNumber.trim() ? 'Enter Customer Phone Number' : 'Send Vehicle Ready WhatsApp Alert'}
              >
                <WhatsAppIcon className="w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] text-[#25D366] shrink-0" />
                <span className="truncate">Vehicle Ready</span>
              </button>

              <button
                type="button"
                onClick={handleTextMessage}
                disabled={!formData.phoneNumber.trim()}
                className={`w-full min-h-[48px] sm:min-h-[50px] px-3 py-2.5 bg-[#1A1A1A] border border-[#2E2E2E] hover:bg-[#262626] active:bg-[#141414] hover:border-[#404040] rounded-[15px] text-[11px] sm:text-xs font-black text-[#FFFFFF] uppercase tracking-wider flex items-center justify-center gap-2 sm:gap-2.5 text-center shadow-xs transition-all ${
                  !formData.phoneNumber.trim()
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-sm'
                }`}
                title={!formData.phoneNumber.trim() ? 'Enter Customer Phone Number' : 'Send SMS Text Message'}
              >
                <SmsIcon className="w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] text-[#2196F3] shrink-0" />
                <span className="truncate">Text SMS</span>
              </button>

              <button
                type="button"
                onClick={handleBillWhatsApp}
                disabled={!formData.phoneNumber.trim()}
                className={`w-full min-h-[48px] sm:min-h-[50px] px-3 py-2.5 bg-[#1A1A1A] border border-[#2E2E2E] hover:bg-[#262626] active:bg-[#141414] hover:border-[#404040] rounded-[15px] text-[11px] sm:text-xs font-black text-[#FFFFFF] uppercase tracking-wider flex items-center justify-center gap-2 sm:gap-2.5 text-center shadow-xs transition-all ${
                  !formData.phoneNumber.trim()
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-sm'
                }`}
                title={!formData.phoneNumber.trim() ? 'Enter Customer Phone Number' : 'Send PDF Invoice on WhatsApp'}
              >
                <WhatsAppIcon className="w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] text-[#25D366] shrink-0" />
                <span className="truncate">WhatsApp Bill</span>
              </button>
            </div>

            {/* PRIMARY SAVE DRAFT CTA BUTTON */}
            <button
              type="submit"
              className="w-full min-h-[48px] sm:min-h-[52px] bg-[#111111] text-white font-black text-xs sm:text-sm rounded-xl uppercase tracking-wider hover:bg-neutral-900 active:bg-neutral-800 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Save size={16} />
              <span>{isEditing ? 'UPDATE JOB SHEET' : 'SAVE DRAFT'}</span>
            </button>
          </div>
        </form>
      </main>

      {/* SUCCESS MODAL POPUP */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setShowSuccessPopup(false)}
          />
          <div className="relative z-10 w-full max-w-xs bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-5 text-center animate-scale-up">
            <div className="w-10 h-10 bg-[#F0FDF4] border border-[#BBF7D0] rounded-full flex items-center justify-center text-green-700 mx-auto mb-2">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-sm font-extrabold text-[#111111] tracking-tight">
              {isEditing ? 'Job Updated Successfully!' : 'Job Saved Successfully!'}
            </h3>
            <p className="text-[11px] text-[#666666] mt-1">
              Vehicle <span className="font-bold text-[#111111]">{savedVehNum}</span> has been saved to Today's Vehicles list.
            </p>

            <div className="mt-4 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessPopup(false);
                  navigate(targetTodayPath);
                }}
                className="w-full h-9 bg-[#111111] text-white font-bold rounded-xl text-[11px] uppercase tracking-wider hover:bg-neutral-900 active:bg-neutral-800 transition-all cursor-pointer"
              >
                Go to Today's Vehicles List →
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
                className="w-full h-9 bg-white border border-[#E5E5E5] text-[#111111] font-bold rounded-xl text-[11px] uppercase tracking-wider hover:bg-[#F7F7F7] active:bg-[#E5E5E5] transition-all cursor-pointer"
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

