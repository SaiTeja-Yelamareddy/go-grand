import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, AlertCircle, UserCheck } from 'lucide-react';
import { authenticateStaff } from '../utils/staffStorage';
import { setCurrentStaff } from '../config/authConfig';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../utils/rateLimiter';
import { ThemeToggle } from '../components/ThemeToggle';

export const StaffLogin: React.FC = () => {
  const navigate = useNavigate();

  const [usernameOrPhone, setUsernameOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Check rate limit threshold before processing
    const limit = checkRateLimit('staff_login', 5);
    if (!limit.allowed) {
      setErrorMsg(`Too many failed login attempts. Please wait ${limit.retryAfterSeconds} seconds before trying again.`);
      return;
    }

    if (!usernameOrPhone.trim() || !password) {
      setErrorMsg('Invalid username/phone or password.');
      return;
    }

    setLoading(true);
    try {
      const res = await authenticateStaff(usernameOrPhone, password);
      if (res.success && res.staff) {
        resetRateLimit('staff_login');
        setCurrentStaff(res.staff);
        navigate('/staff');
      } else {
        const afterFail = recordFailedAttempt('staff_login', 5, 60);
        if (!afterFail.allowed) {
          setErrorMsg(`Too many failed login attempts. Account temporarily locked for ${afterFail.retryAfterSeconds} seconds.`);
        } else {
          setErrorMsg(res.error || 'Invalid username/phone or password.');
        }
      }
    } catch {
      setErrorMsg('Login failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black flex flex-col justify-center items-center px-4 py-8 select-none relative transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-sm p-6 md:p-8 flex flex-col items-center transition-colors">
        {/* HEADER BRANDING */}
        <img src="/logo.png" alt="GO GRAND" className="h-16 object-contain rounded-xl mb-2" />
        <p className="text-xs font-bold text-slate-600 dark:text-neutral-400 tracking-wider uppercase">
          Staff Portal Login
        </p>

        <div className="w-full my-5 border-t border-slate-200 dark:border-[#1F1F1F]" />

        {/* ERROR MESSAGE */}
        {errorMsg && (
          <div className="w-full mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          {/* USERNAME / PHONE */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              Staff Phone Number or Username
            </label>
            <input
              type="text"
              value={usernameOrPhone}
              onChange={(e) => {
                setUsernameOrPhone(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="[ e.g. 9876543210 or Sai Kumar ]"
              className="w-full min-h-[48px] px-3.5 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
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
                placeholder="[ Enter staff password ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white p-2 rounded-lg flex items-center justify-center min-w-[36px] min-h-[36px] cursor-pointer transition-colors"
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
              disabled={loading}
              className="w-full min-h-[50px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-60 text-white dark:text-black font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserCheck size={18} />
              <span>{loading ? 'LOGGING IN...' : 'LOGIN AS STAFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full min-h-[48px] bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] hover:bg-slate-100 dark:hover:bg-[#1A1A1A] text-slate-900 dark:text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 dark:text-neutral-400">
          Contact Owner for new staff login or password reset.
        </div>
      </div>
    </div>
  );
};
