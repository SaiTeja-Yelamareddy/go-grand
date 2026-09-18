import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getCurrentStaff } from '../config/authConfig';
import { ThemeToggle } from './ThemeToggle';

export interface HeaderProps {
  /** Mode: 'owner' or 'staff' */
  mode?: 'owner' | 'staff';

  /** Callback to open/toggle the navigation drawer */
  onToggleDrawer?: () => void;

  /** Custom title (defaults to 'GO GRAND') */
  title?: string;

  /** Custom subtitle */
  subtitle?: string;

  /** Whether to show logo in center (defaults to true) */
  showLogo?: boolean;

  /** Optional back action button */
  onBack?: () => void;

  /** Custom content to render on the right side */
  rightSlot?: React.ReactNode;

  /** Whether to display the role badge */
  showRoleBadge?: boolean;

  /** Whether to display the built-in theme toggle */
  showThemeToggle?: boolean;

  /** Custom class names for the header container */
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  mode = 'owner',
  onToggleDrawer,
  title = 'GO GRAND',
  subtitle = 'CAR WASH & DETAILING',
  showLogo = true,
  onBack,
  rightSlot,
  showRoleBadge = false,
  showThemeToggle = false,
  className = '',
}) => {
  const currentStaff = getCurrentStaff();

  return (
    <header
      className={`sticky top-0 z-50 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-md border-b border-slate-200 dark:border-neutral-900 px-4 sm:px-6 py-3 sm:py-3.5 grid grid-cols-[1fr_auto_1fr] items-center shadow-xs w-full max-w-full transition-colors select-none ${className}`}
    >
      {/* LEFT: LOGO (DRAWER TRIGGER) / BACK */}
      <div className="flex items-center justify-start min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-900 active:bg-slate-200 dark:active:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center min-w-[40px] min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 mr-2"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        {showLogo && (
          <button
            type="button"
            onClick={onToggleDrawer}
            disabled={!onToggleDrawer}
            className={`p-1.5 -ml-1.5 rounded-xl transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              onToggleDrawer
                ? 'hover:bg-slate-100 dark:hover:bg-neutral-900 active:bg-slate-200 dark:active:bg-neutral-800 cursor-pointer'
                : 'cursor-default'
            }`}
            aria-label={onToggleDrawer ? "Open navigation menu" : "GO GRAND"}
          >
            <img
              src="/logo.png"
              alt="GO GRAND"
              className="h-9 sm:h-11 object-contain rounded-lg shadow-2xs shrink-0"
            />
          </button>
        )}
      </div>

      {/* CENTER: GO GRAND NAME & SUBTITLE */}
      <div className="flex flex-col items-center justify-center text-center min-w-0 px-2 select-none">
        <h1
          className="font-black text-[18px] sm:text-[22px] leading-tight text-slate-950 dark:text-white uppercase whitespace-nowrap pl-[0.24em]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 900,
            letterSpacing: '0.24em',
          }}
        >
          {title}
        </h1>
        <p
          className="text-[10px] sm:text-[12px] font-black text-slate-950 dark:text-white uppercase leading-none mt-1.5 whitespace-nowrap pl-[0.32em]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 900,
            letterSpacing: '0.32em',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* RIGHT: OWNER / STAFF */}
      <div className="flex items-center justify-end gap-2.5 shrink-0">
        {rightSlot}

        {showRoleBadge && (
          <div className="px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-bold tracking-wide border uppercase bg-slate-100 dark:bg-neutral-900 text-slate-800 dark:text-neutral-200 border-slate-200 dark:border-neutral-800 shadow-2xs whitespace-nowrap">
            {mode === 'owner'
              ? 'Owner Mode'
              : currentStaff?.staff_name
                ? `STAFF: ${currentStaff.staff_name.toUpperCase()}`
                : 'Staff Mode'}
          </div>
        )}

        {showThemeToggle && (
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;