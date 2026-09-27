import React, { useState } from 'react';
import { X, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../config/supabaseClient';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    setMessage('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus('error');
      setMessage('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setStatus('error');
      setMessage('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('New passwords do not match');
      return;
    }

    setStatus('loading');

    try {
      // First re-authenticate to ensure current password is correct
      // But we can just use supabase.auth.updateUser and if it fails, it fails.
      // Wait, supabase.auth.updateUser doesn't check current password by default unless required by project settings, 
      // but the user requirement explicitly states: "Current Password", "New Password", "Confirm New Password".
      // Let's re-authenticate them first to prove they know the current password.
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user?.email) {
         throw new Error('User email not found in session');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword
      });

      if (signInError) {
        throw new Error('Incorrect current password');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setStatus('success');
      setMessage('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Auto close after 2 seconds
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
        onClose();
      }, 2000);

    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to update password');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-sm bg-white dark:bg-[#0A0A0A] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#1F1F1F] animate-scale-in">
        <div className="p-4 border-b border-slate-200 dark:border-[#1F1F1F] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase">Change Password</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {message && (
            <div className={`p-3 text-xs font-semibold rounded-xl flex items-start gap-2 ${
              status === 'success' 
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
            }`}>
              {status === 'success' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              <span>{message}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={status === 'loading' || status === 'success'}
              className="w-full h-11 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              {status === 'loading' ? 'Updating...' : 'UPDATE PASSWORD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
