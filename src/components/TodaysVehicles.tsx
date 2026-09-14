import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, MoreVertical, X, Car, Download, CheckCircle2, User } from 'lucide-react';
import { NavigationDrawer } from './NavigationDrawer';
import { getTodaysJobRecords, syncJobsFromSupabase, formatNumericDateIST, getISTDateKey, type JobRecord } from '../utils/draftStorage';
import { exportJobsToExcel } from '../utils/excelExport';
import { InvoiceModal } from './InvoiceModal';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { sendWhatsAppBillViaBackend, sendVehicleReadyWhatsAppViaBackend } from '../utils/invoiceUtils';
import { ThemeToggle } from './ThemeToggle';
import { getCurrentStaff } from '../config/authConfig';

interface TodaysVehiclesProps {
  mode: 'staff' | 'owner';
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

export const TodaysVehicles: React.FC<TodaysVehiclesProps> = ({
  mode,
  deferredPrompt,
  onInstallApp,
}) => {
  const navigate = useNavigate();
  const currentStaff = getCurrentStaff();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [records, setRecords] = useState<JobRecord[]>([]);
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
    setRecords(getTodaysJobRecords());
  };

  useEffect(() => {
    reloadRecords();
    syncJobsFromSupabase().then(() => {
      reloadRecords();
    });

    // Auto-refresh periodically (every 30s) and on tab visibility so midnight IST transitions clear automatically
    const interval = setInterval(() => {
      reloadRecords();
    }, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reloadRecords();
        syncJobsFromSupabase().then(() => reloadRecords());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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

  const handleEdit = (record: JobRecord) => {
    setActiveMenuId(null);
    const editPath = mode === 'owner' ? `/owner?editId=${record.id}` : `/staff?editId=${record.id}`;
    navigate(editPath);
  };

  const handleVehicleReady = (record: JobRecord) => {
    setActiveMenuId(null);
    setSelectedVehicleDetails(record);
  };

  const handleDownloadExcel = () => {
    if (records.length === 0) return;
    exportJobsToExcel(records, `GO_GRAND_Todays_Vehicles_${getISTDateKey(new Date())}`);
  };

  const formatDate = (isoString: string) => {
    return formatNumericDateIST(isoString);
  };

  const formatServices = (services?: string[] | string) => {
    if (!services) return '-';
    if (Array.isArray(services)) return services.join(', ');
    return services;
  };

  const formatPrice = (price?: string) => {
    if (!price) return '₹0';
    return price.startsWith('₹') ? price : `₹${price}`;
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#1F1F1F] px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-2xs transition-colors">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 sm:p-2 rounded-lg text-slate-800 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="GO GRAND" className="h-9 sm:h-10 object-contain rounded-lg shadow-2xs" />
            <div className="flex flex-col justify-center">
              <h1 className="font-extrabold text-sm sm:text-base leading-none tracking-tight text-slate-900 dark:text-white uppercase">
                GO GRAND
              </h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-neutral-400 tracking-wider uppercase leading-none mt-0.5">
                CAR WASH & DETAILING
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide border uppercase bg-slate-100 dark:bg-[#141414] text-slate-800 dark:text-neutral-200 border-slate-200 dark:border-[#222222]">
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

      {/* MAIN CONTENT */}
      <main className="flex-1 px-3 sm:px-4 py-4 sm:py-6 max-w-5xl mx-auto w-full">
        {/* PAGE TITLE HEADER */}
        <div className="mb-4 sm:mb-5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Today&apos;s Vehicles
            </h2>
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-neutral-400 mt-0.5">
              Single-row vehicle records registered today
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] px-2.5 sm:px-3 py-1.5 rounded-lg">
              Total: {records.length}
            </div>
            {mode === 'owner' && (
              <button
                onClick={handleDownloadExcel}
                disabled={records.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-black rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[34px]"
                title="Download today's vehicles in Excel format"
              >
                <Download size={14} />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>

        {/* EMPTY STATE */}
        {records.length === 0 ? (
          <div className="w-full bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-6 sm:p-8 text-center flex flex-col items-center justify-center my-6 sm:my-8 shadow-2xs transition-colors">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] rounded-2xl flex items-center justify-center text-slate-500 dark:text-neutral-400 mb-3 sm:mb-4">
              <Car size={26} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              No vehicles added today
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              Job records created today will appear here in a clean table format.
            </p>
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
                  {records.map((item, index) => {
                    const isLastRow = index === records.length - 1 && records.length > 1;
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

      {/* VEHICLE DETAILS MODAL (VEHICLE READY) */}
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

            <div className="py-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Date:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatDate(selectedVehicleDetails.createdAt)}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Vehicle Number:</span>
                <span className="font-extrabold text-slate-900 dark:text-white">{selectedVehicleDetails.vehicleNumber}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Vehicle Name:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedVehicleDetails.vehicleName || '-'}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Owner Name:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedVehicleDetails.customerName}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Phone Number:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedVehicleDetails.phoneNumber}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Location:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedVehicleDetails.location || '-'}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Service:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatServices(selectedVehicleDetails.services || selectedVehicleDetails.service)}
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-200 dark:border-[#1F1F1F] pb-2">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Created By:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedVehicleDetails.createdBy || 'Staff'}</span>
              </div>

              <div className="flex justify-between pt-1">
                <span className="text-slate-500 dark:text-neutral-400 font-medium">Price:</span>
                <span className="font-extrabold text-base text-slate-900 dark:text-white">{formatPrice(selectedVehicleDetails.price)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedVehicleDetails(null)}
                className="w-full min-h-[44px] bg-slate-900 dark:bg-white text-white dark:text-black font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] transition-all cursor-pointer"
              >
                CLOSE
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white border-l-4 border-[#25D366] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in max-w-[90vw]">
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
