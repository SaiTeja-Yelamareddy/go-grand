import React, { useState, useEffect } from 'react';
import { Plus, MoreVertical, Edit3, Trash2, Check, X, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { NavigationDrawer } from '../components/NavigationDrawer';
import { Header } from '../components/Header';
import {
  syncServiceSectionsFromSupabase,
  addServiceSection,
  updateServiceSectionName,
  deleteServiceSection,
  addServiceToSection,
  updateServiceName,
  deleteServiceFromSection,
  type ServiceSection,
} from '../utils/serviceStorage';

interface OwnerServicesProps {
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

export const OwnerServices: React.FC<OwnerServicesProps> = ({
  deferredPrompt,
  onInstallApp,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sections, setSections] = useState<ServiceSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Section state
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Add Service state (keyed by sectionId)
  const [addingServiceSectionId, setAddingServiceSectionId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState('');

  // Editing Section Name state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');

  // Editing Service Name state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingServiceName, setEditingServiceName] = useState('');

  // Three-dot active menu
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const reloadSections = async () => {
    try {
      const data = await syncServiceSectionsFromSupabase();
      setSections(data);
    } catch (err: any) {
      console.error('Failed to reload sections:', err);
    }
  };

  useEffect(() => {
    reloadSections();
  }, []);

  // Section Handlers
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSectionName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await addServiceSection(name);
      setNewSectionName('');
      setShowAddSection(false);
      await reloadSections();
      showToast('success', `Section "${name}" created successfully.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create section in Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSectionName = async (sectionId: string) => {
    const name = editingSectionName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await updateServiceSectionName(sectionId, name);
      setEditingSectionId(null);
      setEditingSectionName('');
      await reloadSections();
      showToast('success', 'Section name updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update section name.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSectionConfirm = async (section: ServiceSection) => {
    setActiveMenuKey(null);
    if (section.services.length > 0) {
      if (
        !window.confirm(
          `Section "${section.name}" contains ${section.services.length} services. Are you sure you want to delete this section?`
        )
      ) {
        return;
      }
    } else {
      if (!window.confirm(`Delete section "${section.name}"?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      await deleteServiceSection(section.id);
      await reloadSections();
      showToast('success', `Section "${section.name}" deleted.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete section from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  // Service Handlers
  const handleCreateService = async (sectionId: string, e: React.FormEvent) => {
    e.preventDefault();
    const name = newServiceName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await addServiceToSection(sectionId, name);
      setNewServiceName('');
      setAddingServiceSectionId(null);
      await reloadSections();
      showToast('success', `Service "${name}" added.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to add service in Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServiceName = async (sectionId: string, serviceId: string) => {
    const name = editingServiceName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await updateServiceName(sectionId, serviceId, name);
      setEditingServiceId(null);
      setEditingServiceName('');
      await reloadSections();
      showToast('success', 'Service updated.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update service in Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteServiceConfirm = async (sectionId: string, serviceId: string, name: string) => {
    setActiveMenuKey(null);
    if (!window.confirm(`Delete service "${name}"?`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteServiceFromSection(sectionId, serviceId);
      await reloadSections();
      showToast('success', `Service "${name}" deleted.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete service from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-white flex flex-col transition-colors">
      {/* HEADER */}
      <Header
        mode="owner"
        onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
      />

      {/* NAVIGATION DRAWER */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={onInstallApp}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full pb-20">
        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div
            className={`fixed top-18 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl shadow-2xl text-xs font-bold transition-all animate-bounce ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border border-emerald-400'
                : 'bg-red-600 text-white border border-red-400'
            }`}
          >
            {toastMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* PAGE TITLE */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
              Add / Update Services
            </h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400 mt-0.5">
              Organize services into categories for the job sheet
            </p>
          </div>
          <div className="w-10 h-10 bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-xl flex items-center justify-center text-slate-800 dark:text-neutral-200">
            <Shield size={20} />
          </div>
        </div>

        {/* SERVICE SECTIONS LIST */}
        <div className="space-y-6">
          {sections.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-xs">
              <p className="text-sm font-medium text-slate-500 dark:text-neutral-400">
                No service sections yet.
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <div
                key={section.id}
                className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] shadow-2xs overflow-hidden transition-colors"
              >
                {/* SECTION HEADER */}
                <div className="p-4 bg-slate-50 dark:bg-[#121212] border-b border-slate-200 dark:border-[#1F1F1F] flex items-center justify-between">
                  {editingSectionId === section.id ? (
                    <div className="flex items-center gap-2 w-full max-w-sm">
                      <input
                        type="text"
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        className="flex-1 min-h-[44px] px-3 bg-white dark:bg-[#1A1A1A] border border-slate-900 dark:border-white rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveSectionName(section.id)}
                        disabled={loading}
                        className="p-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => setEditingSectionId(null)}
                        className="p-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-500 dark:text-neutral-400 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                          {section.name}
                        </h3>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400">
                          {section.services.length} {section.services.length === 1 ? 'service' : 'services'}
                        </p>
                      </div>

                      <div className="relative">
                        <button
                          onClick={() =>
                            setActiveMenuKey(activeMenuKey === `sec_${section.id}` ? null : `sec_${section.id}`)
                          }
                          className="w-10 h-10 rounded-xl text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-[#1C1C1C] flex items-center justify-center transition-colors cursor-pointer"
                          aria-label="Section options"
                        >
                          <MoreVertical size={18} />
                        </button>

                        {/* SECTION MENU POPOVER */}
                        {activeMenuKey === `sec_${section.id}` && (
                          <div className="absolute right-0 top-11 z-30 w-44 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl shadow-2xl p-1 text-left animate-fade-in">
                            <button
                              onClick={() => {
                                setActiveMenuKey(null);
                                setEditingSectionId(section.id);
                                setEditingSectionName(section.name);
                              }}
                              className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center gap-2 text-left cursor-pointer"
                            >
                              <Edit3 size={15} />
                              <span>Edit Section</span>
                            </button>
                            <button
                              onClick={() => handleDeleteSectionConfirm(section)}
                              className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 text-left cursor-pointer"
                            >
                              <Trash2 size={15} />
                              <span>Delete Section</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* SERVICES LIST IN SECTION */}
                <div className="divide-y divide-slate-200 dark:divide-[#1F1F1F]">
                  {section.services.map((srv) => (
                    <div key={srv.id} className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-[#141414] transition-colors">
                      {editingServiceId === srv.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editingServiceName}
                            onChange={(e) => setEditingServiceName(e.target.value)}
                            className="flex-1 min-h-[44px] px-3 bg-white dark:bg-[#1A1A1A] border border-slate-900 dark:border-white rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveServiceName(section.id, srv.id)}
                            disabled={loading}
                            className="p-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => setEditingServiceId(null)}
                            className="p-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-500 dark:text-neutral-400 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {srv.name}
                          </span>

                          <div className="relative">
                            <button
                              onClick={() =>
                                setActiveMenuKey(
                                  activeMenuKey === `srv_${srv.id}` ? null : `srv_${srv.id}`
                                )
                              }
                              className="w-10 h-10 rounded-xl text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-[#1C1C1C] flex items-center justify-center transition-colors cursor-pointer"
                              aria-label="Service options"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {/* SERVICE MENU POPOVER */}
                            {activeMenuKey === `srv_${srv.id}` && (
                              <div className="absolute right-0 top-10 z-30 w-36 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl shadow-2xl p-1 text-left animate-fade-in">
                                <button
                                  onClick={() => {
                                    setActiveMenuKey(null);
                                    setEditingServiceId(srv.id);
                                    setEditingServiceName(srv.name);
                                  }}
                                  className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] flex items-center gap-2 text-left cursor-pointer"
                                >
                                  <Edit3 size={14} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteServiceConfirm(section.id, srv.id, srv.name)}
                                  className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 text-left cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {section.services.length === 0 && (
                    <div className="p-4 text-xs font-medium text-slate-500 dark:text-neutral-400 text-center italic">
                      No services in this section yet.
                    </div>
                  )}
                </div>

                {/* ADD SERVICE FORM FOR THIS SECTION */}
                <div className="p-3 bg-slate-50/60 dark:bg-[#0D0D0D] border-t border-slate-200 dark:border-[#1F1F1F]">
                  {addingServiceSectionId === section.id ? (
                    <form onSubmit={(e) => handleCreateService(section.id, e)} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        placeholder="[ Enter service name ]"
                        className="flex-1 min-h-[48px] px-3.5 bg-white dark:bg-[#121212] border border-slate-900 dark:border-white rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="min-h-[48px] px-4 bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold uppercase rounded-xl hover:bg-slate-800 dark:hover:bg-neutral-200 cursor-pointer disabled:opacity-50"
                      >
                        ADD SERVICE
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingServiceSectionId(null);
                          setNewServiceName('');
                        }}
                        className="min-h-[48px] px-3 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-500 dark:text-neutral-400 rounded-xl cursor-pointer"
                      >
                        <X size={18} />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingServiceSectionId(section.id);
                        setNewServiceName('');
                      }}
                      className="w-full min-h-[48px] px-4 rounded-xl border border-dashed border-slate-400 dark:border-neutral-700 text-slate-800 dark:text-neutral-200 hover:bg-white dark:hover:bg-[#141414] text-xs font-extrabold tracking-wide uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Plus size={16} />
                      <span>Add Service</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ADD SECTION BUTTON & FORM */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-[#1F1F1F]">
          {showAddSection ? (
            <form onSubmit={handleCreateSection} className="bg-white dark:bg-[#0A0A0A] p-4 rounded-2xl border border-slate-900 dark:border-white shadow-sm space-y-3">
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Section Name
              </label>
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="[ Full Car Wash ]"
                className="w-full min-h-[48px] px-3.5 bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#262626] rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-white"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[48px] bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer hover:bg-slate-800 dark:hover:bg-neutral-200 disabled:opacity-50"
                >
                  ADD SECTION
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSection(false);
                    setNewSectionName('');
                  }}
                  className="px-4 min-h-[48px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-bold text-xs uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full min-h-[54px] bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-neutral-200 active:scale-[0.99] text-white dark:text-black font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={18} />
              <span>ADD SECTION</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
};
