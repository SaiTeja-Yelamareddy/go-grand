import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Smartphone, Users, CreditCard, MessageSquare } from 'lucide-react';
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle Android / browser back button
  useEffect(() => {
    if (!isOpen) return;
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isOpen, onClose]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

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
    { label: '💬 MESSAGE CUSTOMIZATION', path: '/owner/messages' },
    { label: 'UPI PAYMENT SETTINGS', action: 'upi' },
    { label: 'WHATSAPP LINKED DEVICE', action: 'whatsapp' },
    { label: 'LOGOUT', action: 'logout' },
  ];

  const currentItems = mode === 'owner' ? ownerItems : staffItems;

  const handleClick = (item: MenuItem) => {
    if (item.action === 'upi') {
      onClose();
      setIsUpiModalOpen(true);
    } else if (item.action === 'whatsapp') {
      onClose();
      setIsWaModalOpen(true);
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

  if (!isOpen && !isWaModalOpen && !isUpiModalOpen) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Main Navigation">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside
            id="navigation-drawer"
            className="relative z-10 w-4/5 max-w-xs bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-white h-full shadow-2xl flex flex-col justify-between border-r border-[#E5E5E5] dark:border-[#1F1F1F] transition-all duration-300 ease-out animate-slide-in-left"
          >
            <div className="flex-1 overflow-y-auto">
              {/* Header */}
              <div className="p-4 border-b border-[#E5E5E5] dark:border-[#1F1F1F] flex items-center justify-between bg-white dark:bg-[#0A0A0A]">
                <div>
                  <img src="/logo.png" alt="GO GRAND" className="h-8 object-contain rounded-md mb-0.5" />
                  <p className="text-[10px] font-black text-[#111111] dark:text-white uppercase tracking-wider">
                    CAR WASH & DETAILING
                  </p>
                  <p className="text-[10px] font-bold text-[#666666] dark:text-neutral-400 tracking-wider uppercase mt-0.5">
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
                    className="p-2 rounded-lg text-[#111111] dark:text-white hover:bg-[#F7F7F7] dark:hover:bg-[#1A1A1A] active:bg-[#E5E5E5] dark:active:bg-[#222222] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Button List */}
              <div className="p-4 space-y-2">
                {currentItems.map((item) => {
                  const isActive =
                    item.path &&
                    (location.pathname === item.path ||
                      (item.path === '/staff' && location.pathname === '/staff/job') ||
                      (item.path === '/owner' && location.pathname === '/owner/job'));
                  const isWhatsApp = item.action === 'whatsapp';
                  const isUpi = item.action === 'upi';
                  const isManageStaff = item.path === '/owner/staff';
                  const isMessages = item.path === '/owner/messages';

                  return (
                    <button
                      key={item.label}
                      onClick={() => handleClick(item)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full min-h-[48px] px-4 rounded-xl text-sm font-bold tracking-wide uppercase transition-colors text-left flex items-center justify-between border cursor-pointer ${
                        isUpi
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                          : isWhatsApp
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                          : isActive
                          ? 'bg-[#111111] dark:bg-white text-white dark:text-black border-[#111111] dark:border-white shadow-xs'
                          : 'bg-white dark:bg-[#121212] text-[#111111] dark:text-neutral-200 border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F7F7F7] dark:hover:bg-[#1A1A1A] active:bg-[#E5E5E5] dark:active:bg-[#222222]'
                      }`}
                    >
                      <span className="flex items-center space-x-2.5">
                        {isUpi && <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
                        {isWhatsApp && <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        {isManageStaff && <Users className="w-4 h-4 text-current shrink-0" />}
                        {isMessages && <MessageSquare className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />}
                        <span>{item.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-[#E5E5E5] dark:border-[#1F1F1F] bg-[#F7F7F7] dark:bg-[#050505] text-center shrink-0">
              <p className="text-xs font-extrabold text-[#111111] dark:text-white uppercase tracking-wider">GO GRAND</p>
              <p className="text-[10px] font-semibold text-[#666666] dark:text-neutral-400 uppercase">Car Wash & Detailing</p>
            </div>
          </aside>
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

