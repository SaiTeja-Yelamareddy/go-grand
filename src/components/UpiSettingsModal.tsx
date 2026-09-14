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
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 text-left animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E5]">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#111111] uppercase tracking-wide">
                UPI PAYMENT SETTINGS
              </h3>
              <p className="text-[11px] font-semibold text-[#666666]">
                Owner Configuration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#666666] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Banner */}
        <div className="my-4 p-3.5 bg-[#F7F7F7] rounded-xl border border-[#E5E5E5] flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-[#444444] leading-relaxed">
            Configure your official business UPI ID. When clicking <b>VEHICLE READY</b>, a dynamic payment QR with the exact invoice total will automatically be generated for the customer.
          </p>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Success Feedback */}
        {savedFeedback && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>GO GRAND UPI Settings updated successfully!</span>
          </div>
        )}

        {/* VIEW MODE: Saved UPI ID with EDIT button */}
        {!isEditing && savedUpiId ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-[#111111] uppercase tracking-wider">
                  Configured UPI ID
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <Check size={10} />
                  Active
                </span>
              </div>

              {/* Display Box */}
              <div className="w-full min-h-[50px] px-4 py-3 bg-[#F7F7F7] border border-[#E5E5E5] rounded-xl flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-[#111111] tracking-wide select-all">
                  {savedUpiId}
                </span>
              </div>
              <p className="text-[11px] text-[#666666] mt-1.5">
                Payments generated on Vehicle Ready are credited to this UPI ID.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 min-h-[48px] bg-white border border-[#E5E5E5] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] text-[#111111] font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
                className="w-2/3 min-h-[48px] bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-2">
                UPI ID {savedUpiId && <span className="text-amber-600 font-bold">(Editing)</span>}
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
                className="w-full min-h-[48px] px-3.5 bg-white border-2 border-[#111111] rounded-xl text-sm font-semibold text-[#111111] placeholder-[#888888] focus:outline-none focus:ring-1 focus:ring-[#111111] transition-all"
              />
              <p className="text-[11px] text-[#666666] mt-1.5">
                Example: <span className="font-mono font-bold text-[#111111]">gogrand@upi</span> or <span className="font-mono font-bold text-[#111111]">8008195435@okhdfcbank</span>
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={savedUpiId ? handleCancelEdit : onClose}
                className="w-1/3 min-h-[48px] bg-white border border-[#E5E5E5] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] text-[#111111] font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-2/3 min-h-[48px] bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save size={16} />
                <span>{savedUpiId ? 'UPDATE UPI SETTINGS' : 'SAVE UPI SETTINGS'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 pt-3 border-t border-[#E5E5E5] text-center text-[10px] font-semibold text-[#888888]">
          Security: The raw UPI ID is never exposed as plain text to customers.
        </div>
      </div>
    </div>
  );
};
