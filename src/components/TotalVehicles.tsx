import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, X, Car, Search, ChevronDown, Download, CheckCircle2, User } from 'lucide-react';
import { NavigationDrawer } from './NavigationDrawer';
import { Header } from './Header';
import { getAllJobRecords, syncJobsFromSupabase, formatNumericDateIST, type JobRecord } from '../utils/draftStorage';
import { exportJobsToExcel } from '../utils/excelExport';
import { InvoiceModal } from './InvoiceModal';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { sendWhatsAppBillViaBackend, sendVehicleReadyWhatsAppViaBackend } from '../utils/invoiceUtils';

interface TotalVehiclesProps {
  mode: 'staff' | 'owner';
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const TotalVehicles: React.FC<TotalVehiclesProps> = ({
  mode,
  deferredPrompt,
  onInstallApp,
}) => {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [allRecords, setAllRecords] = useState<JobRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedVehicleDetails, setSelectedVehicleDetails] = useState<JobRecord | null>(null);
  const [selectedInvoiceRecord, setSelectedInvoiceRecord] = useState<JobRecord | null>(null);
  const [toastData, setToastData] = useState<{ title: string; detail: string } | null>(null);
  const [showWhatsAppSettingsModal, setShowWhatsAppSettingsModal] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const showToast = (title: string, detail: string) => {
    setToastData({ title, detail });
    setTimeout(() => setToastData(null), 4000);
  };

  const reloadRecords = () => {
    setAllRecords(getAllJobRecords());
  };

  useEffect(() => {
    reloadRecords();
    syncJobsFromSupabase().then(() => {
      reloadRecords();
    });
  }, []);

  // Close three-dot popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuId]);

  // Extract available years dynamically from records
  const availableYears = useMemo(() => {
    const yearSet = new Set<string>();
    allRecords.forEach((job) => {
      if (job.createdAt) {
        try {
          const yearStr = new Date(job.createdAt).getFullYear().toString();
          if (!isNaN(Number(yearStr))) {
            yearSet.add(yearStr);
          }
        } catch {
          // ignore
        }
      }
    });

    const years = Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
    if (years.length === 0) {
      years.push(new Date().getFullYear().toString());
    }
    return years;
  }, [allRecords]);

  // Combined Filtering Pipeline (Year -> Month -> Search)
  const filteredRecords = useMemo(() => {
    return allRecords.filter((job) => {
      const jobDate = job.createdAt ? new Date(job.createdAt) : new Date();

      // 1. Year Filter
      if (selectedYear !== 'all') {
        const jobYear = jobDate.getFullYear().toString();
        if (jobYear !== selectedYear) return false;
      }

      // 2. Month Filter
      if (selectedMonth !== 'all') {
        const jobMonthIdx = jobDate.getMonth().toString();
        if (jobMonthIdx !== selectedMonth) return false;
      }

      // 3. Search Filter (Vehicle Number, Owner Name, Vehicle Name, Staff)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesVehNum = job.vehicleNumber?.toLowerCase().includes(q);
        const matchesOwner = job.customerName?.toLowerCase().includes(q);
        const matchesVehName = job.vehicleName?.toLowerCase().includes(q);
        const matchesStaff = job.createdBy?.toLowerCase().includes(q);

        if (!matchesVehNum && !matchesOwner && !matchesVehName && !matchesStaff) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, searchQuery, selectedMonth, selectedYear]);

  const formatDate = (dateStr: string) => {
    return formatNumericDateIST(dateStr);
  };

  const formatServices = (val: string[] | string | undefined) => {
    if (Array.isArray(val)) {
      return val.length > 0 ? val.join(', ') : 'Standard Service';
    }
    return val || 'Standard Service';
  };

  const formatPrice = (priceStr: string) => {
    const clean = priceStr.replace(/[^0-9.]/g, '');
    return clean ? `₹${clean}` : priceStr.startsWith('₹') ? priceStr : `₹${priceStr}`;
  };

  const handleEdit = (item: JobRecord) => {
    setActiveMenuId(null);
    const targetPath = mode === 'owner' ? `/owner?editId=${item.id}` : `/staff?editId=${item.id}`;
    navigate(targetPath);
  };

  const handleVehicleReady = (item: JobRecord) => {
    setActiveMenuId(null);
    setSelectedVehicleDetails(item);
  };

  const handleDownloadExcel = () => {
    let fileLabel = 'GO_GRAND_Total_Vehicles';
    if (selectedYear !== 'all') {
      fileLabel += `_${selectedYear}`;
    }
    if (selectedMonth !== 'all') {
      const monthIdx = Number(selectedMonth);
      const monthName = MONTH_NAMES[monthIdx] || `Month_${selectedMonth}`;
      fileLabel += `_${monthName}`;
    }
    if (searchQuery.trim()) {
      fileLabel += `_Filtered`;
    }

    exportJobsToExcel(filteredRecords, fileLabel);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
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

      {/* MAIN CONTENT */}
      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
        {/* PAGE TITLE */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Total Vehicles
            </h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400 mt-0.5">
              All registered vehicle wash records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] px-3 py-1.5 rounded-lg">
              Total: {filteredRecords.length} / {allRecords.length}
            </div>
            {mode === 'owner' && (
              <button
                onClick={handleDownloadExcel}
                disabled={filteredRecords.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-black rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[34px]"
                title="Download filtered vehicles in Excel format"
              >
                <Download size={14} />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>

        {/* SEARCH AND FILTERS CONTROLS */}
        <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-4 sm:p-5 mb-6 shadow-xs space-y-4 transition-colors">
          {/* SEARCH BAR */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-neutral-500">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vehicle number, owner, model, or staff..."
              className="w-full min-h-[44px] pl-10 pr-10 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* YEAR & MONTH DROPDOWNS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200 dark:border-[#1F1F1F]">
            {/* YEAR SELECTOR */}
            <div>
              <label className="block text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
                Filter by Year
              </label>
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 pr-9 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-slate-900 dark:focus:border-white appearance-none cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 dark:text-neutral-500">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>

            {/* MONTH SELECTOR */}
            <div>
              <label className="block text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
                Filter by Month
              </label>
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 pr-9 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-slate-900 dark:focus:border-white appearance-none cursor-pointer"
                >
                  <option value="all">All Months</option>
                  {MONTH_NAMES.map((mName, idx) => (
                    <option key={mName} value={idx.toString()}>
                      {mName}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 dark:text-neutral-500">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RECORDS LIST CONTAINER */}
        {allRecords.length === 0 ? (
          /* EMPTY STATE 1: NO RECORDS TOTAL */
          <div className="w-full bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-8 text-center flex flex-col items-center justify-center my-8 shadow-2xs transition-colors">
            <div className="w-14 h-14 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] rounded-2xl flex items-center justify-center text-slate-500 dark:text-neutral-400 mb-4">
              <Car size={26} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No vehicles added yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              Registered vehicle wash jobs will automatically appear in this list.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          /* EMPTY STATE 2: NO VEHICLES MATCH FILTER */
          <div className="w-full bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-8 text-center flex flex-col items-center justify-center my-8 shadow-2xs transition-colors">
            <div className="w-14 h-14 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] rounded-2xl flex items-center justify-center text-slate-500 dark:text-neutral-400 mb-4">
              <Search size={26} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No vehicles found
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              No records match your selected search or filter criteria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedMonth('all');
                setSelectedYear('all');
              }}
              className="mt-4 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          /* COMPACT TABLE CONTAINER */
          <div className="w-full bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xs relative overflow-visible transition-colors">
            <div className="w-full relative overflow-visible">
              <table className="w-full text-left border-collapse table-fixed">
                {/* COLUMN HEADERS */}
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#121212] border-b border-slate-200 dark:border-[#1F1F1F] text-[9px] sm:text-[11px] font-black text-slate-700 dark:text-neutral-300 uppercase tracking-wider">
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[12%] truncate">DATE</th>
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[15%] truncate">VEHICLE</th>
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[14%] truncate">NAME</th>
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[14%] truncate">OWNER</th>
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[16%] truncate">SERVICE</th>
                    <th className="py-2.5 px-1 sm:px-4 font-bold w-[11%] truncate">PRICE</th>
                    {mode === 'owner' && (
                      <th className="py-2.5 px-1 sm:px-4 font-bold w-[11%] truncate">STAFF</th>
                    )}
                    <th className="py-2.5 px-1 sm:px-4 font-bold text-center w-[7%]">ACTION</th>
                  </tr>
                </thead>

                {/* ROW ENTRIES */}
                <tbody className="divide-y divide-slate-200 dark:divide-[#1F1F1F] text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                  {filteredRecords.map((item, index) => {
                    const isLastRow = index === filteredRecords.length - 1 && filteredRecords.length > 1;
                    return (
                      <tr 
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-[#141414] transition-colors relative"
                      >
                        {/* DATE */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[9px] sm:text-xs font-bold text-slate-500 dark:text-neutral-400 truncate">
                          {formatDate(item.createdAt)}
                        </td>

                        {/* VEHICLE NUMBER */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
                          {item.vehicleNumber}
                        </td>

                        {/* VEHICLE NAME */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[10px] sm:text-sm text-slate-700 dark:text-neutral-200 truncate">
                          {item.vehicleName || '-'}
                        </td>

                        {/* OWNER NAME */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[10px] sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.customerName}
                        </td>

                        {/* SERVICE */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[9px] sm:text-sm text-slate-900 dark:text-white truncate">
                          <span className="inline-block px-1 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] text-slate-800 dark:text-neutral-200 font-medium truncate max-w-full">
                            {formatServices(item.services || item.service)}
                          </span>
                        </td>

                        {/* PRICE */}
                        <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[10px] sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {formatPrice(item.price)}
                        </td>

                        {/* STAFF (IN OWNER MODE) */}
                        {mode === 'owner' && (
                          <td className="py-2.5 sm:py-4 px-1 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white truncate">
                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] text-[10px] sm:text-[11px] font-bold text-slate-800 dark:text-neutral-200 truncate">
                              <User size={10} className="shrink-0 text-slate-500 dark:text-neutral-400" />
                              <span className="truncate">{item.createdBy || 'Staff'}</span>
                            </span>
                          </td>
                        )}

                        {/* THREE-DOT MENU BUTTON & FLOATING DROPDOWN POPUP */}
                        <td className="py-2 px-1 sm:px-4 text-center">
                          <div className="relative inline-block text-left">
                            <button
                              onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                              className="w-7 h-7 sm:w-10 sm:h-10 mx-auto rounded-lg text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center justify-center transition-colors cursor-pointer"
                              aria-label="Actions"
                            >
                              <MoreVertical size={16} className="sm:w-4 sm:h-4" />
                            </button>

                            {/* FLOATING DROPDOWN MENU ATTACHED DIRECTLY TO BUTTON */}
                            {activeMenuId === item.id && (
                              <div
                                ref={menuRef}
                                className={`absolute right-0 ${
                                  isLastRow ? 'bottom-full mb-1' : 'top-full mt-1'
                                } z-50 w-40 sm:w-44 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl shadow-2xl p-1 text-left animate-fade-in transition-colors`}
                              >
                                <button
                                  onClick={async () => {
                                    setActiveMenuId(null);
                                    const res = await sendWhatsAppBillViaBackend(item);
                                    if (res.success) {
                                      showToast('BILL SENT THROUGH LINKED WHATSAPP', `PDF Tax Invoice sent to ${item.phoneNumber}`);
                                    } else {
                                      showToast('⚠️ WHATSAPP NOT CONNECTED', res.error || 'Please link your WhatsApp device in Settings.');
                                      setShowWhatsAppSettingsModal(true);
                                    }
                                  }}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-[#25D366] hover:bg-green-50 dark:hover:bg-green-950/40 flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  WHATSAPP BILL
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedInvoiceRecord(item);
                                  }}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  VIEW INVOICE
                                </button>

                                <button
                                  onClick={async () => {
                                    setActiveMenuId(null);
                                    const res = await sendVehicleReadyWhatsAppViaBackend(item);
                                    if (res.success) {
                                      showToast('MESSAGE SENT THROUGH LINKED WHATSAPP', `Vehicle Ready alert sent to ${item.phoneNumber}`);
                                    } else {
                                      showToast('⚠️ WHATSAPP NOT CONNECTED', res.error || 'Please link your WhatsApp device in Settings.');
                                      setShowWhatsAppSettingsModal(true);
                                    }
                                  }}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  VEHICLE READY 🚗
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    handleVehicleReady(item);
                                  }}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  VEHICLE DETAILS
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    handleEdit(item);
                                  }}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  EDIT
                                </button>

                                <button
                                  onClick={() => setActiveMenuId(null)}
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center justify-start tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  CLOSE
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* VEHICLE DETAILS MODAL */}
      {selectedVehicleDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedVehicleDetails(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-6 text-left transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1F1F1F]">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-wide">
                Vehicle Record Details
              </h3>
              <button
                onClick={() => setSelectedVehicleDetails(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Date</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatDate(selectedVehicleDetails.createdAt)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Vehicle Number</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedVehicleDetails.vehicleNumber}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Vehicle Name</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedVehicleDetails.vehicleName || '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Owner Name</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedVehicleDetails.customerName}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Phone Number</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedVehicleDetails.phoneNumber || '-'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Location</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {selectedVehicleDetails.location || '-'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Service</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatServices(selectedVehicleDetails.services || selectedVehicleDetails.service)}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Created By / Staff</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedVehicleDetails.createdBy || 'Staff'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Price</p>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {formatPrice(selectedVehicleDetails.price)}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#1F1F1F]">
              <button
                onClick={() => setSelectedVehicleDetails(null)}
                className="w-full min-h-[48px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-bold text-sm tracking-wider uppercase rounded-xl transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedInvoiceRecord && (
        <InvoiceModal
          record={selectedInvoiceRecord}
          onClose={() => setSelectedInvoiceRecord(null)}
        />
      )}

      {/* LINKED WHATSAPP SENT FLOATING TOAST */}
      {toastData && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[100] w-auto sm:min-w-[360px] max-w-[calc(100vw-2rem)] bg-[#111111] text-white border border-white/20 border-l-4 border-l-[#25D366] px-4 py-3.5 rounded-xl shadow-2xl flex items-start gap-3 animate-fade-in"
        >
          <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-[#25D366]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-sm tracking-wide uppercase text-[#25D366] leading-tight">
              {toastData.title}
            </p>
            <p className="text-xs text-white/80 font-medium mt-1 leading-relaxed break-words">{toastData.detail}</p>
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
