import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, UserCheck } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

export const ModeSelection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black flex flex-col justify-center items-center px-4 py-8 select-none relative transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-sm p-6 md:p-8 flex flex-col items-center text-center transition-colors">
        {/* LOGO & BRANDING */}
        <div className="relative mb-6 flex flex-col items-center">
          <img src="/logo.png" alt="GO GRAND" className="h-20 object-contain rounded-2xl shadow-md mb-2" />
          <p className="text-xs font-bold text-slate-600 dark:text-neutral-400 tracking-wider uppercase">
            Car Wash & Detailing
          </p>
        </div>

        <div className="w-full my-2 border-t border-slate-200 dark:border-[#1F1F1F]" />

        <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400 my-4 uppercase tracking-widest">
          Select Operating Mode
        </p>

        {/* MODE BUTTONS */}
        <div className="w-full space-y-4">
          <button
            onClick={() => navigate('/owner/login')}
            className="w-full min-h-[56px] bg-white dark:bg-[#121212] border-2 border-slate-900 dark:border-white hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-black active:scale-[0.99] text-slate-900 dark:text-white font-bold text-base tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all duration-150 shadow-xs cursor-pointer"
          >
            <Shield size={22} className="shrink-0" />
            <span>OWNER MODE</span>
          </button>

          <button
            onClick={() => navigate('/staff/login')}
            className="w-full min-h-[56px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-bold text-base tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all duration-150 shadow-xs cursor-pointer"
          >
            <UserCheck size={22} className="shrink-0 text-white dark:text-black" />
            <span>STAFF MODE</span>
          </button>
        </div>

        {/* FOOTER LABEL */}
        <div className="mt-8 text-xs text-slate-500 dark:text-neutral-500">
          Professional Mobile Management • v1.0
        </div>
      </div>
    </div>
  );
};
