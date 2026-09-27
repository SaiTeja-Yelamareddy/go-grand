import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // When the user clicks the reset link in their email, they are redirected here.
    // Supabase automatically parses the hash fragment and establishes a session.
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus('error');
        setMessage('Invalid or expired password reset link. Please request a new one.');
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    setMessage('');

    if (!newPassword || !confirmPassword) {
      setStatus('error');
      setMessage('Both fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setStatus('error');
      setMessage('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match');
      return;
    }

    setStatus('loading');

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setStatus('success');
      setMessage('Password reset successfully. Redirecting to login...');
      
      // Log them out so they can log back in with the new password, or redirect to owner dashboard
      setTimeout(() => {
        supabase.auth.signOut().then(() => {
          navigate('/owner/login');
        });
      }, 2000);

    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to reset password');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black flex flex-col justify-center items-center px-4 py-8 select-none relative transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-sm p-6 md:p-8 flex flex-col items-center transition-colors">
        <img src="/logo.png" alt="GO GRAND" className="h-16 object-contain rounded-xl mb-2" />
        <p className="text-xs font-bold text-slate-600 dark:text-neutral-400 tracking-wider uppercase">
          Set New Password
        </p>

        <div className="w-full my-5 border-t border-slate-200 dark:border-[#1F1F1F]" />

        {message && (
          <div className={`w-full mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2 ${
            status === 'success' 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/60'
          }`}>
            {status === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              New Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setMessage('');
                  }
                }}
                disabled={status === 'success' || status === 'error' && message.includes('expired')}
                placeholder="[ Enter new password ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={status === 'success' || status === 'error' && message.includes('expired')}
                className="absolute right-2 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white p-2 rounded-lg flex items-center justify-center min-w-[36px] min-h-[36px] cursor-pointer transition-colors disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              Confirm New Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setMessage('');
                  }
                }}
                disabled={status === 'success' || status === 'error' && message.includes('expired')}
                placeholder="[ Confirm new password ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div className="pt-3 space-y-3">
            <button
              type="submit"
              disabled={status === 'loading' || status === 'success' || (status === 'error' && message.includes('expired'))}
              className="w-full min-h-[50px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-60 text-white dark:text-black font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{status === 'loading' ? 'SAVING...' : 'SAVE NEW PASSWORD'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
