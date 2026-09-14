import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { loginOwner } from '../config/authConfig';

export const OwnerLogin: React.FC = () => {
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginId.trim() || !password) {
      setErrorMsg('Invalid Login ID or Password');
      return;
    }

    const success = loginOwner(loginId, password);
    if (success) {
      navigate('/owner');
    } else {
      setErrorMsg('Invalid Login ID or Password');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col justify-center items-center px-4 py-8 select-none">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5E5] shadow-xs p-6 md:p-8 flex flex-col items-center">
        
        {/* HEADER BRANDING */}
        <img src="/logo.png" alt="GO GRAND" className="h-16 object-contain rounded-xl mb-2" />
        <p className="text-xs font-bold text-[#666666] tracking-wider uppercase">
          Owner Portal Login
        </p>

        <div className="w-full my-5 border-t border-[#E5E5E5]" />

        {/* ERROR MESSAGE */}
        {errorMsg && (
          <div className="w-full mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          
          {/* LOGIN ID */}
          <div>
            <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-2">
              Login ID
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="[ Enter login ID ]"
              className="w-full min-h-[48px] px-3.5 bg-white border border-[#E5E5E5] rounded-lg text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all"
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="[ Enter password ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white border border-[#E5E5E5] rounded-lg text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 text-[#666666] hover:text-[#111111] p-2 rounded-lg flex items-center justify-center min-w-[36px] min-h-[36px] cursor-pointer transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-3 space-y-3">
            <button
              type="submit"
              className="w-full min-h-[50px] bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>LOGIN</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full min-h-[48px] bg-white border border-[#E5E5E5] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] text-[#111111] font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
