import React, { useState, useEffect } from 'react';
import {
  Menu,
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
    <div className="min-h-screen bg-[#F7F7F7] text-[#111111] flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E5E5E5] px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg text-[#111111] hover:bg-[#F7F7F7] active:bg-[#E5E5E5] min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="GO GRAND" className="h-9 sm:h-10 object-contain rounded-lg shadow-2xs" />
            <div className="flex flex-col justify-center">
              <h1 className="font-extrabold text-sm sm:text-base leading-tight tracking-tight text-[#111111] uppercase">
                GO GRAND
              </h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#333333] tracking-wider uppercase leading-none mt-0.5">
                CAR WASH & DETAILING
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border uppercase bg-[#F7F7F7] text-[#111111] border-[#E5E5E5]">
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
            <h2 className="text-xl md:text-2xl font-black text-[#111111] tracking-tight flex items-center gap-2">
              <Users size={24} className="shrink-0" />
              <span>Staff Management</span>
            </h2>
            <p className="text-xs font-semibold text-[#444444] mt-0.5">
              Create individual staff accounts, manage credentials, and enable/disable access
            </p>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all shadow-xs cursor-pointer min-h-[44px]"
          >
            <UserPlus size={16} />
            <span>ADD STAFF MEMBER</span>
          </button>
        </div>

        {/* SUMMARY STATS */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-3.5 shadow-2xs text-center">
            <p className="text-[11px] font-bold text-[#666666] uppercase tracking-wider">Total Staff</p>
            <p className="text-2xl font-black text-[#111111] mt-1">{staffList.length}</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-2xs text-center">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white border border-neutral-300 rounded-xl p-3.5 shadow-2xs text-center">
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Disabled</p>
            <p className="text-2xl font-black text-neutral-600 mt-1">{disabledCount}</p>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="mb-4 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#666666]">
            <Search size={16} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff by name or phone..."
            className="w-full min-h-[44px] pl-10 pr-4 bg-white border border-[#E5E5E5] rounded-xl text-sm text-[#111111] font-medium placeholder-[#666666] focus:outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#111111] transition-all shadow-2xs"
          />
        </div>

        {/* STAFF LIST TABLE / CARDS */}
        {filteredStaff.length === 0 ? (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-12 text-center shadow-xs">
            <Users size={40} className="mx-auto text-[#888888] mb-3" />
            <p className="text-sm font-bold text-[#111111]">No staff members found</p>
            <p className="text-xs text-[#666666] mt-1">
              Click &quot;ADD STAFF MEMBER&quot; above to create a new individual staff account.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#F7F7F7] text-[11px] font-extrabold text-[#111111] uppercase tracking-wider">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Phone / Username</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] text-xs sm:text-sm font-medium text-[#111111]">
                  {filteredStaff.map((staff) => (
                    <tr key={staff.id} className="hover:bg-[#F7F7F7] transition-colors">
                      {/* NAME */}
                      <td className="py-3 px-4 font-bold text-[#111111]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white font-black text-xs flex items-center justify-center uppercase shrink-0">
                            {staff.staff_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-extrabold">{staff.staff_name}</p>
                            <p className="text-[10px] text-[#666666] font-normal">
                              Added {new Date(staff.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* PHONE / USERNAME */}
                      <td className="py-3 px-4 font-semibold text-[#333333]">
                        {staff.phone_number}
                      </td>

                      {/* ROLE */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-neutral-100 text-neutral-800 border border-neutral-200">
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
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-300 hover:bg-neutral-200'
                          }`}
                          title={`Click to ${staff.active ? 'Disable' : 'Enable'} staff`}
                        >
                          {staff.active ? (
                            <>
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={13} className="text-neutral-500 shrink-0" />
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
                            className="p-2 rounded-lg text-[#111111] hover:bg-[#E5E5E5] active:bg-[#D4D4D4] transition-colors cursor-pointer"
                            title="Edit staff details / password"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setDeleteConfirmStaff(staff)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsAddModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h3 className="font-extrabold text-base text-[#111111] uppercase tracking-wide flex items-center gap-2">
                <UserPlus size={18} />
                <span>Add New Staff Member</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-[#666666] hover:bg-[#F7F7F7] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sai Kumar"
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Phone Number / Login ID
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Create secure staff password"
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-[#111111] uppercase">Account Status</span>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    formActive
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                  }`}
                >
                  {formActive ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 min-h-[44px] bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] hover:bg-[#F7F7F7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 min-h-[44px] bg-[#111111] text-white rounded-xl text-xs font-bold hover:bg-neutral-900 cursor-pointer"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setEditingStaff(null)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h3 className="font-extrabold text-base text-[#111111] uppercase tracking-wide flex items-center gap-2">
                <Edit2 size={18} />
                <span>Edit Staff Member</span>
              </h3>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-[#666666] hover:bg-[#F7F7F7] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Phone Number / Login ID
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111111] uppercase mb-1.5">
                  Reset Password <span className="text-[10px] text-[#666666] font-normal">(Leave blank to keep existing)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Enter new password to change"
                    className="w-full min-h-[44px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:border-[#111111]"
                  />
                  <Key size={16} className="absolute right-3.5 text-[#888888] pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-[#111111] uppercase">Account Status</span>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    formActive
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                  }`}
                >
                  {formActive ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="w-1/2 min-h-[44px] bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] hover:bg-[#F7F7F7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 min-h-[44px] bg-[#111111] text-white rounded-xl text-xs font-bold hover:bg-neutral-900 cursor-pointer"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteConfirmStaff(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl p-6 text-center">
            <Trash2 size={36} className="mx-auto text-red-600 mb-3" />
            <h3 className="font-extrabold text-base text-[#111111] uppercase">Delete Staff Member</h3>
            <p className="text-xs text-[#666666] mt-2">
              Are you sure you want to delete <span className="font-bold text-[#111111]">{deleteConfirmStaff.staff_name}</span>? This action cannot be undone.
            </p>
            <div className="pt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStaff(null)}
                className="w-1/2 min-h-[42px] bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#111111] hover:bg-[#F7F7F7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                className="w-1/2 min-h-[42px] bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 cursor-pointer"
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
