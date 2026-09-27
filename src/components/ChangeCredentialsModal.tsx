import React, { useState, useEffect } from 'react';
import { X, KeyRound, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { getOwnerLoginId, updateOwnerCredentials } from '../config/authConfig';
import { useNotifications } from './NotificationSystem';

interface ChangeCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangeCredentialsModal: React.FC<ChangeCredentialsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { notify } = useNotifications();

  const [currentLoginId, setCurrentLoginId] = useState<string>('');
  const [newLoginId, setNewLoginId] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const activeId = getOwnerLoginId();
      setCurrentLoginId(activeId);
      setNewLoginId(activeId);
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setErrorMsg('');
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanNewLoginId = newLoginId.trim();

    if (!cleanNewLoginId) {
      setErrorMsg('Please enter a valid New Login ID.');
      return;
    }

    if (!newPassword) {
      setErrorMsg('Please enter a New Password.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New Password and Confirm Password do not match.');
      return;
    }

    setIsSaving(true);

    try {
      await updateOwnerCredentials(cleanNewLoginId, newPassword);

      notify({
        type: 'success',
        title: 'Credentials Updated',
        message: 'Owner Login ID and Password have been changed successfully.',
      });

      onClose();
    } catch (err: any) {
      console.error('Failed to change credentials:', err);
      const msg = err?.message || 'Failed to update credentials. Please try again.';
      setErrorMsg(msg);
      notify({
        type: 'error',
        title: 'Update Failed',
        message: msg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Change Login Credentials">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-6 text-left animate-fade-in transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1F1F1F]">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-wide">
                CHANGE LOGIN CREDENTIALS
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400">
                Owner Security Settings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSaveChanges} className="space-y-4 mt-4">
          {/* Current LOGIN ID */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              LOGIN ID
            </label>
            <input
              type="text"
              readOnly
              value={currentLoginId}
              placeholder="[ current login ID ]"
              className="w-full min-h-[48px] px-3.5 bg-slate-100 dark:bg-[#151515] border border-slate-200 dark:border-[#262626] rounded-xl text-sm font-semibold text-slate-600 dark:text-neutral-400 cursor-not-allowed select-all"
            />
            <p className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1">
              Currently active login username
            </p>
          </div>

          {/* NEW LOGIN ID */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              NEW LOGIN ID
            </label>
            <input
              type="text"
              value={newLoginId}
              onChange={(e) => {
                setNewLoginId(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="[ enter new login ID ]"
              className="w-full min-h-[48px] px-3.5 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
            />
          </div>

          {/* NEW PASSWORD */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              NEW PASSWORD
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="[ enter new password ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white transition-colors cursor-pointer p-1"
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* CONFIRM PASSWORD */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              CONFIRM PASSWORD
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="[ enter password again ]"
                className="w-full min-h-[48px] pl-3.5 pr-11 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white transition-colors cursor-pointer p-1"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-1/3 min-h-[48px] bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] hover:bg-slate-100 dark:hover:bg-[#1A1A1A] text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-2/3 min-h-[48px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>SAVING...</span>
                </>
              ) : (
                <span>SAVE CHANGES</span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-5 pt-3 border-t border-slate-200 dark:border-[#1F1F1F] text-center text-[10px] font-semibold text-slate-400 dark:text-neutral-500">
          Security: Credentials are securely hashed with bcrypt before saving.
        </div>
      </div>
    </div>
  );
};
