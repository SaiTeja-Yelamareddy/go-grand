import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X,
  FileText,
  Car,
  Layers,
  Wrench,
  Users,
  CreditCard,
  Smartphone,
  LogOut,
} from 'lucide-react';
import { logoutOwner, logoutStaff, getCurrentStaff } from '../config/authConfig';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { UpiSettingsModal } from './UpiSettingsModal';

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
  icon: React.ComponentType<{ className?: string; size?: number }>;
  action?: 'logout' | 'whatsapp' | 'upi';
  isDestructive?: boolean;
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

  // Handle Escape key to close
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
    { label: "Today's Job Sheet", path: '/staff', icon: FileText },
    { label: "Today's Vehicles", path: '/staff/today', icon: Car },
    { label: 'All Vehicles', path: '/staff/vehicles', icon: Layers },
  ];

  const ownerItems: MenuItem[] = [
    { label: "Today's Job Sheet", path: '/owner', icon: FileText },
    { label: "Today's Vehicles", path: '/owner/today', icon: Car },
    { label: 'All Vehicles', path: '/owner/vehicles', icon: Layers },
    { label: 'Services', path: '/owner/services', icon: Wrench },
    { label: 'Staff', path: '/owner/staff', icon: Users },
    { label: 'UPI Settings', action: 'upi', icon: CreditCard },
    { label: 'WhatsApp Linked Device', action: 'whatsapp', icon: Smartphone },
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

  const isPathActive = (itemPath?: string) => {
    if (!itemPath) return false;
    if (location.pathname === itemPath) return true;
    if (itemPath === '/staff' && location.pathname === '/staff/job') return true;
    if (itemPath === '/owner' && location.pathname === '/owner/job') return true;
    return false;
  };

  return (
    <>
      {/* Drawer Overlay */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Drawer Panel */}
        <aside
          id="navigation-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Main Navigation"
          className={`fixed inset-y-0 left-0 z-50 w-[290px] sm:w-[320px] max-w-[85vw] bg-white text-[#111111] h-full shadow-2xl flex flex-col justify-between border-r border-[#E5E7EB] transition-transform duration-300 ease-out transform ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Top Section */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-[#E5E7EB] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png"
                  alt="GO GRAND"
                  className="h-10 w-10 object-contain rounded-lg shrink-0 border border-[#E5E7EB]"
                />
                <div className="flex flex-col justify-center min-w-0">
                  <span className="font-black text-sm tracking-tight text-[#111111] uppercase truncate leading-none">
                    GO GRAND
                  </span>
                  <span className="text-[10px] font-semibold text-[#6B7280] tracking-wider uppercase leading-none mt-1 truncate">
                    CAR WASH & DETAILING
                  </span>
                  <span className="text-[9px] font-bold text-[#9CA3AF] tracking-wide uppercase mt-1">
                    {mode === 'owner'
                      ? 'Owner Mode'
                      : currentStaff?.staff_name
                      ? `Staff: ${currentStaff.staff_name}`
                      : 'Staff Mode'}
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-[#6B7280] hover:text-[#111111] hover:bg-[#F3F4F6] min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation List */}
            <nav className="p-3 sm:p-4 space-y-1.5 flex-1" aria-label="Main Menu">
              {currentItems.map((item) => {
                const active = isPathActive(item.path);
                const IconComponent = item.icon;

                return (
                  <button
                    key={item.label}
                    onClick={() => handleClick(item)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-colors text-left flex items-center justify-between border cursor-pointer ${
                      active
                        ? 'bg-[#FFF4CC] text-[#111111] border-[#FDE047] font-extrabold shadow-2xs'
                        : 'bg-white text-[#111111] border-transparent hover:bg-[#F9FAFB] hover:border-[#E5E7EB]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0 truncate">
                      <IconComponent
                        size={18}
                        className={`shrink-0 ${
                          active ? 'text-[#D97706]' : 'text-[#6B7280]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Drawer Footer & Logout */}
          <div className="p-3 sm:p-4 border-t border-[#E5E7EB] bg-[#FAFAFA] shrink-0 space-y-2">
            <button
              onClick={() => handleClick({ label: 'Logout', action: 'logout', icon: LogOut })}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-colors text-left flex items-center gap-3 border border-[#E5E7EB] bg-white text-[#EF4444] hover:bg-[#FEF2F2] hover:border-[#FCA5A5] cursor-pointer"
            >
              <LogOut size={18} className="shrink-0 text-[#EF4444]" />
              <span>Logout</span>
            </button>
            <div className="text-center pt-1">
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                GO GRAND Car Wash & Detailing
              </p>
            </div>
          </div>
        </aside>
      </div>

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
