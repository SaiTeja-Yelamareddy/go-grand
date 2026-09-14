import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Smartphone, Users, CreditCard } from 'lucide-react';
import { logoutOwner, logoutStaff, getCurrentStaff } from '../config/authConfig';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { UpiSettingsModal } from './UpiSettingsModal';
import { ThemeToggle } from './ThemeToggle';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'staff' | 'owner';
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

interface MenuItem {
  label: string;
  path?: string;
  action?: 'logout' | 'whatsapp' | 'upi';
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  mode,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isWaModalOpen, setIsWaModalOpen] = useState<boolean>(false);
  const [isUpiModalOpen, setIsUpiModalOpen] = useState<boolean>(false);
  const currentStaff = getCurrentStaff();

  if (!isOpen && !isWaModalOpen && !isUpiModalOpen) return null;

  const staffItems: MenuItem[] = [
    { label: 'NEW JOB', path: '/staff' },
    { label: "TODAY'S VEHICLES", path: '/staff/today' },
    { label: 'TOTAL VEHICLES', path: '/staff/vehicles' },
    { label: 'LOGOUT', action: 'logout' },
  ];

  const ownerItems: MenuItem[] = [
    { label: 'NEW JOB', path: '/owner' },
    { label: "TODAY'S VEHICLES", path: '/owner/today' },
    { label: 'TOTAL VEHICLES', path: '/owner/vehicles' },
    { label: 'MANAGE STAFF', path: '/owner/staff' },
    { label: 'ADD / UPDATE SERVICES', path: '/owner/services' },
    { label: 'UPI PAYMENT SETTINGS', action: 'upi' },
    { label: 'WHATSAPP LINKED DEVICE', action: 'whatsapp' },
    { label: 'LOGOUT', action: 'logout' },
  ];

  const currentItems = mode === 'owner' ? ownerItems : staffItems;

  const handleClick = (item: MenuItem) => {
    if (item.action === 'upi') {
      setIsUpiModalOpen(true);
      onClose();
    } else if (item.action === 'whatsapp') {
      setIsWaModalOpen(true);
      onClose();
    } else if (item.action === 'logout') {
      onClose();
      if (mode === 'owner') {
        logoutOwner();
      } else {
        logoutStaff();
      }
      navigate('/');
    } else if (item.path) {
      onClose();
      navigate(item.path);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative z-10 w-4/5 max-w-xs bg-white dark:bg-[#0A0A0A] text-slate-900 dark:text-white h-full shadow-2xl flex flex-col justify-between border-r border-slate-200 dark:border-[#1F1F1F] transition-colors">
            <div>
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-[#1F1F1F] flex items-center justify-between bg-white dark:bg-[#0A0A0A]">
                <div>
                  <img src="/logo.png" alt="GO GRAND" className="h-8 object-contain rounded-md mb-0.5" />
                  <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    CAR WASH & DETAILING
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 tracking-wider uppercase mt-0.5">
                    {mode === 'owner'
                      ? 'Owner Menu'
                      : currentStaff?.staff_name
                      ? `STAFF: ${currentStaff.staff_name.toUpperCase()}`
                      : 'Staff Menu'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <ThemeToggle />
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Button List */}
              <div className="p-4 space-y-2">
                {currentItems.map((item) => {
                  const isActive = item.path && (
                    location.pathname === item.path ||
                    (item.path === '/staff' && location.pathname === '/staff/job') ||
                    (item.path === '/owner' && location.pathname === '/owner/job')
                  );
                  const isWhatsApp = item.action === 'whatsapp';
                  const isUpi = item.action === 'upi';
                  const isManageStaff = item.path === '/owner/staff';

                  return (
                    <button
                      key={item.label}
                      onClick={() => handleClick(item)}
                      className={`w-full min-h-[48px] px-4 rounded-xl text-sm font-bold tracking-wide uppercase transition-all text-left flex items-center justify-between border cursor-pointer ${
                        isUpi
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-100 dark:hover:bg-amber-950/70'
                          : isWhatsApp
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
                          : isActive
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-black border-slate-900 dark:border-white shadow-xs'
                          : 'bg-white dark:bg-[#121212] text-slate-900 dark:text-white border-slate-200 dark:border-[#222222] hover:bg-slate-50 dark:hover:bg-[#1A1A1A]'
                      }`}
                    >
                      <span className="flex items-center space-x-2.5">
                        {isUpi && <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
                        {isWhatsApp && <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        {isManageStaff && <Users className="w-4 h-4 text-slate-800 dark:text-white shrink-0" />}
                        <span>{item.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-200 dark:border-[#1F1F1F] bg-slate-50 dark:bg-[#050505] text-center">
              <p className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">GO GRAND</p>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 uppercase">Car Wash & Detailing</p>
            </div>
          </div>
        </div>
      )}

      {/* UPI Payment Settings Modal */}
      <UpiSettingsModal
        isOpen={isUpiModalOpen}
        onClose={() => setIsUpiModalOpen(false)}
      />

      {/* WhatsApp QR & Settings Modal */}
      <WhatsAppSettingsModal
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
      />
    </>
  );
};
