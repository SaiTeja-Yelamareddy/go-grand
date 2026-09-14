import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, UserCheck } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

export const ModeSelection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col justify-center items-center px-4 py-8 select-none relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5E5] shadow-xs p-6 md:p-8 flex flex-col items-center text-center">
        {/* LOGO & BRANDING */}
        <div className="relative mb-6 flex flex-col items-center">
          <img src="/logo.png" alt="GO GRAND" className="h-20 object-contain rounded-2xl shadow-md mb-2" />
          <p className="text-xs font-bold text-[#666666] tracking-wider uppercase">
            Car Wash & Detailing
          </p>
        </div>

        <div className="w-full my-2 border-t border-[#E5E5E5]" />

        <p className="text-xs font-medium text-[#666666] my-4 uppercase tracking-widest">
          Select Operating Mode
        </p>

        {/* MODE BUTTONS */}
        <div className="w-full space-y-4">
          <button
            onClick={() => navigate('/owner/login')}
            className="w-full min-h-[56px] bg-white border-2 border-[#111111] hover:bg-[#111111] hover:text-white active:bg-neutral-800 active:text-white text-[#111111] font-bold text-base tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all duration-150 shadow-xs cursor-pointer"
          >
            <Shield size={22} className="shrink-0" />
            <span>OWNER MODE</span>
          </button>

          <button
            onClick={() => navigate('/staff/login')}
            className="w-full min-h-[56px] bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white font-bold text-base tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all duration-150 shadow-xs cursor-pointer"
          >
            <UserCheck size={22} className="shrink-0 text-white" />
            <span>STAFF MODE</span>
          </button>
        </div>

        {/* FOOTER LABEL */}
        <div className="mt-8 text-xs text-[#666666]">
          Professional Mobile Management • v1.0
        </div>
      </div>
    </div>
  );
};
