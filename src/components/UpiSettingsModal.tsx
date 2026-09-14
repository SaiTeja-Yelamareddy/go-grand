import React, { useState, useEffect } from 'react';
import { X, CreditCard, Save, CheckCircle2, ShieldCheck, Edit3, Check } from 'lucide-react';
import { getStoredUpiId, saveUpiId } from '../utils/upiStorage';

interface UpiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpiSettingsModal: React.FC<UpiSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [savedUpiId, setSavedUpiId] = useState<string>('');
  const [upiIdInput, setUpiIdInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const current = getStoredUpiId();
      setSavedUpiId(current);
      setUpiIdInput(current);
      // If no UPI ID is saved yet, open directly in edit/input mode
      setIsEditing(!current);
      setSavedFeedback(false);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartEdit = () => {
    setUpiIdInput(savedUpiId);
    setIsEditing(true);
    setErrorMsg('');
    setSavedFeedback(false);
  };

  const handleCancelEdit = () => {
    setUpiIdInput(savedUpiId);
    // If no UPI ID was previously saved, keep in edit mode; otherwise exit edit mode
    setIsEditing(!savedUpiId);
    setErrorMsg('');
  };

  const handleSaveOrUpdateUpi = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmed = upiIdInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a valid business UPI ID');
      return;
    }

    if (!trimmed.includes('@') || trimmed.length < 5) {
      setErrorMsg('Invalid UPI ID format. (e.g. gogrand@upi or 8008195435@okhdfcbank)');
      return;
    }

    // Save and update single active record
    saveUpiId(trimmed);
    setSavedUpiId(trimmed);
    setIsEditing(false);
    setSavedFeedback(true);

    setTimeout(() => {
      setSavedFeedback(false);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-wide">
                UPI PAYMENT SETTINGS
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400">
                Owner Configuration
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

        {/* Info Banner */}
        <div className="my-4 p-3.5 bg-slate-50 dark:bg-[#121212] rounded-xl border border-slate-200 dark:border-[#262626] flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-neutral-300 leading-relaxed">
            Configure your official business UPI ID. When clicking <b className="text-slate-900 dark:text-white">VEHICLE READY</b>, a dynamic payment QR with the exact invoice total will automatically be generated for the customer.
          </p>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Success Feedback */}
        {savedFeedback && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>GO GRAND UPI Settings updated successfully!</span>
          </div>
        )}

        {/* VIEW MODE: Saved UPI ID with EDIT button */}
        {!isEditing && savedUpiId ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Configured UPI ID
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                  <Check size={10} />
                  Active
                </span>
              </div>

              {/* Display Box */}
              <div className="w-full min-h-[50px] px-4 py-3 bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white tracking-wide select-all">
                  {savedUpiId}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1.5">
                Payments generated on Vehicle Ready are credited to this UPI ID.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 min-h-[48px] bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] hover:bg-slate-100 dark:hover:bg-[#1A1A1A] text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
                className="w-2/3 min-h-[48px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Edit3 size={16} />
                <span>EDIT UPI ID</span>
              </button>
            </div>
          </div>
        ) : (
          /* EDIT / CREATE MODE: Input field with SAVE / UPDATE button */
          <form onSubmit={handleSaveOrUpdateUpi} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                UPI ID {savedUpiId && <span className="text-amber-600 dark:text-amber-400 font-bold">(Editing)</span>}
              </label>
              <input
                type="text"
                autoFocus
                value={upiIdInput}
                onChange={(e) => {
                  setUpiIdInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="[ Enter GO GRAND UPI ID ] e.g. gogrand@upi"
                className="w-full min-h-[48px] px-3.5 bg-white dark:bg-[#121212] border-2 border-slate-900 dark:border-white rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all"
              />
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1.5">
                Example: <span className="font-mono font-bold text-slate-900 dark:text-white">gogrand@upi</span> or <span className="font-mono font-bold text-slate-900 dark:text-white">8008195435@okhdfcbank</span>
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={savedUpiId ? handleCancelEdit : onClose}
                className="w-1/3 min-h-[48px] bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] hover:bg-slate-100 dark:hover:bg-[#1A1A1A] text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-2/3 min-h-[48px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save size={16} />
                <span>{savedUpiId ? 'UPDATE UPI SETTINGS' : 'SAVE UPI SETTINGS'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 pt-3 border-t border-slate-200 dark:border-[#1F1F1F] text-center text-[10px] font-semibold text-slate-400 dark:text-neutral-500">
          Security: The raw UPI ID is never exposed as plain text to customers.
        </div>
      </div>
    </div>
  );
};
