import React, { useState, useEffect } from 'react';
import {
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Search,
  Users,
  Shield,
  Key,
  X,
  UserPlus,
} from 'lucide-react';
import { NavigationDrawer } from '../components/NavigationDrawer';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  getStaffProfiles,
  addStaffProfile,
  updateStaffProfile,
  toggleStaffStatus,
  deleteStaffProfile,
  type StaffProfile,
} from '../utils/staffStorage';

interface OwnerStaffProps {
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

export const OwnerStaff: React.FC<OwnerStaffProps> = ({
  deferredPrompt,
  onInstallApp,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffProfile | null>(null);

  // Form States for Add/Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState('');

  const loadStaff = async () => {
    try {
      const list = await getStaffProfiles();
      setStaffList(list);
    } catch (err) {
      console.error('Failed to load staff:', err);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleOpenAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormPassword('');
    setFormActive(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (staff: StaffProfile) => {
    setEditingStaff(staff);
    setFormName(staff.staff_name);
    setFormPhone(staff.phone_number);
    setFormPassword(''); // blank means keep existing password
    setFormActive(staff.active);
    setFormError('');
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Staff name is required');
      return;
    }
    if (!formPhone.trim()) {
      setFormError('Phone number / username is required');
      return;
    }
    if (!formPassword.trim()) {
      setFormError('Password is required');
      return;
    }

    try {
      await addStaffProfile({
        staff_name: formName,
        phone_number: formPhone,
        password: formPassword,
        active: formActive,
      });
      setIsAddModalOpen(false);
      await loadStaff();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add staff member');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    if (!formName.trim()) {
      setFormError('Staff name is required');
      return;
    }
    if (!formPhone.trim()) {
      setFormError('Phone number / username is required');
      return;
    }

    try {
      await updateStaffProfile(editingStaff.id, {
        staff_name: formName,
        phone_number: formPhone,
        password: formPassword.trim() ? formPassword : undefined,
        active: formActive,
      });
      setEditingStaff(null);
      await loadStaff();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update staff member');
    }
  };

  const handleToggleStatus = async (id: string) => {
    await toggleStaffStatus(id);
    await loadStaff();
  };

  const handleDeleteStaff = async () => {
    if (!deleteConfirmStaff) return;
    await deleteStaffProfile(deleteConfirmStaff.id);
    setDeleteConfirmStaff(null);
    await loadStaff();
  };

  const filteredStaff = staffList.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      s.staff_name.toLowerCase().includes(q) ||
      s.phone_number.toLowerCase().includes(q)
    );
  });

  const activeCount = staffList.filter((s) => s.active).length;
  const disabledCount = staffList.filter((s) => !s.active).length;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#1F1F1F] px-4 py-3 flex items-center justify-between shadow-2xs transition-colors">
        <div className="flex items-center min-w-0">
          <button
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="flex items-center gap-2.5 min-w-0 p-1 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1A1A1A] active:bg-slate-200 dark:active:bg-[#222222] transition-colors cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            aria-label="Toggle navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="navigation-drawer"
          >
            <img src="/logo.png" alt="GO GRAND" className="h-9 sm:h-10 object-contain rounded-lg shadow-2xs shrink-0" />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base leading-tight tracking-tight text-slate-900 dark:text-white uppercase truncate">
                GO GRAND
              </h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-neutral-400 tracking-wider uppercase leading-none mt-0.5 truncate">
                CAR WASH & DETAILING
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border uppercase bg-slate-100 dark:bg-[#141414] text-slate-800 dark:text-neutral-200 border-slate-200 dark:border-[#222222]">
            Owner Mode
          </div>
        </div>
      </header>

      {/* NAVIGATION DRAWER */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={onInstallApp}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
        {/* PAGE TITLE & ACTIONS */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Users size={24} className="shrink-0" />
              <span>Staff Management</span>
            </h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400 mt-0.5">
              Create individual staff accounts, manage credentials, and enable/disable access
            </p>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all shadow-xs cursor-pointer min-h-[44px]"
          >
            <UserPlus size={16} />
            <span>ADD STAFF MEMBER</span>
          </button>
        </div>

        {/* SUMMARY STATS */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-xl p-3.5 shadow-2xs text-center transition-colors">
            <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Total Staff</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{staffList.length}</p>
          </div>
          <div className="bg-white dark:bg-[#0A0A0A] border border-emerald-300 dark:border-emerald-800/60 rounded-xl p-3.5 shadow-2xs text-center transition-colors">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Active</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-xl p-3.5 shadow-2xs text-center transition-colors">
            <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">Disabled</p>
            <p className="text-2xl font-black text-slate-600 dark:text-neutral-400 mt-1">{disabledCount}</p>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="mb-4 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-neutral-500">
            <Search size={16} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff by name or phone..."
            className="w-full min-h-[44px] pl-10 pr-4 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:border-slate-900 dark:focus:border-white focus:ring-1 focus:ring-slate-900 dark:focus:ring-white transition-all shadow-2xs"
          />
        </div>

        {/* STAFF LIST TABLE / CARDS */}
        {filteredStaff.length === 0 ? (
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-12 text-center shadow-xs transition-colors">
            <Users size={40} className="mx-auto text-slate-400 dark:text-neutral-600 mb-3" />
            <p className="text-sm font-bold text-slate-900 dark:text-white">No staff members found</p>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              Click &quot;ADD STAFF MEMBER&quot; above to create a new individual staff account.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl shadow-xs overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1F1F1F] bg-slate-50 dark:bg-[#121212] text-[11px] font-extrabold text-slate-700 dark:text-neutral-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Phone / Username</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#1F1F1F] text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                  {filteredStaff.map((staff) => (
                    <tr key={staff.id} className="hover:bg-slate-50/80 dark:hover:bg-[#141414] transition-colors">
                      {/* NAME */}
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black font-black text-xs flex items-center justify-center uppercase shrink-0">
                            {staff.staff_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-white">{staff.staff_name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-neutral-400 font-normal">
                              Added {new Date(staff.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* PHONE / USERNAME */}
                      <td className="py-3 px-4 font-semibold text-slate-700 dark:text-neutral-300">
                        {staff.phone_number}
                      </td>

                      {/* ROLE */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-slate-100 dark:bg-[#1A1A1A] text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-[#2A2A2A]">
                          <Shield size={10} />
                          {staff.role}
                        </span>
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleStatus(staff.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                            staff.active
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100'
                              : 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-neutral-400 border border-slate-300 dark:border-[#2A2A2A] hover:bg-slate-200'
                          }`}
                          title={`Click to ${staff.active ? 'Disable' : 'Enable'} staff`}
                        >
                          {staff.active ? (
                            <>
                              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={13} className="text-slate-400 shrink-0" />
                              <span>Disabled</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(staff)}
                            className="p-2 rounded-lg text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors cursor-pointer"
                            title="Edit staff details / password"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setDeleteConfirmStaff(staff)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Delete staff member"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ADD STAFF MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsAddModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-6 text-left transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1F1F1F]">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                <UserPlus size={18} />
                <span>Add New Staff Member</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sai Kumar"
                  className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Phone Number / Login ID
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Create secure staff password"
                  className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">Account Status</span>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    formActive
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60'
                      : 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-neutral-300 border border-slate-300 dark:border-[#2A2A2A]'
                  }`}
                >
                  {formActive ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 min-h-[44px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 min-h-[44px] bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STAFF MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setEditingStaff(null)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-6 text-left transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1F1F1F]">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                <Edit2 size={18} />
                <span>Edit Staff Member</span>
              </h3>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Phone Number / Login ID
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase mb-1.5">
                  Reset Password <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-normal">(Leave blank to keep existing)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Enter new password to change"
                    className="w-full min-h-[44px] px-3.5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-900 dark:focus:border-white"
                  />
                  <Key size={16} className="absolute right-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">Account Status</span>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    formActive
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60'
                      : 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-neutral-300 border border-slate-300 dark:border-[#2A2A2A]'
                  }`}
                >
                  {formActive ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="w-1/2 min-h-[44px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 min-h-[44px] bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setDeleteConfirmStaff(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xl p-6 text-center transition-colors">
            <Trash2 size={36} className="mx-auto text-red-600 mb-3" />
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase">Delete Staff Member</h3>
            <p className="text-xs text-slate-600 dark:text-neutral-300 mt-2">
              Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">{deleteConfirmStaff.staff_name}</span>? This action cannot be undone.
            </p>
            <div className="pt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStaff(null)}
                className="w-1/2 min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                className="w-1/2 min-h-[42px] bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 active:scale-[0.99] transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
