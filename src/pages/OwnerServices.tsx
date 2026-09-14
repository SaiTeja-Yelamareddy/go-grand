import React, { useState, useEffect } from 'react';
import { Menu, Plus, MoreVertical, Edit3, Trash2, Check, X, Shield } from 'lucide-react';
import { NavigationDrawer } from '../components/NavigationDrawer';
import { ThemeToggle } from '../components/ThemeToggle';
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

  const reloadSections = async () => {
    const data = await syncServiceSectionsFromSupabase();
    setSections(data);
  };

  useEffect(() => {
    reloadSections();
  }, []);

  // Section Handlers
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    await addServiceSection(newSectionName);
    setNewSectionName('');
    setShowAddSection(false);
    await reloadSections();
  };

  const handleSaveSectionName = async (sectionId: string) => {
    if (!editingSectionName.trim()) return;
    await updateServiceSectionName(sectionId, editingSectionName);
    setEditingSectionId(null);
    setEditingSectionName('');
    await reloadSections();
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
    }
    await deleteServiceSection(section.id);
    await reloadSections();
  };

  // Service Handlers
  const handleCreateService = async (sectionId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;
    await addServiceToSection(sectionId, newServiceName);
    setNewServiceName('');
    setAddingServiceSectionId(null);
    await reloadSections();
  };

  const handleSaveServiceName = async (sectionId: string, serviceId: string) => {
    if (!editingServiceName.trim()) return;
    await updateServiceName(sectionId, serviceId, editingServiceName);
    setEditingServiceId(null);
    setEditingServiceName('');
    await reloadSections();
  };

  const handleDeleteServiceConfirm = async (sectionId: string, serviceId: string, name: string) => {
    setActiveMenuKey(null);
    if (window.confirm(`Delete service "${name}"?`)) {
      await deleteServiceFromSection(sectionId, serviceId);
      await reloadSections();
    }
  };

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
              <h1 className="font-extrabold text-sm sm:text-base leading-none tracking-tight text-[#111111] uppercase">
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
          <div className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border uppercase bg-[#111111] text-white border-[#111111]">
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
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* PAGE TITLE */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-[#111111] tracking-tight uppercase">
              Add / Update Services
            </h2>
            <p className="text-xs font-semibold text-[#444444] mt-0.5">
              Organize services into categories for the job sheet
            </p>
          </div>
          <div className="w-10 h-10 bg-white border border-[#E5E5E5] rounded-xl flex items-center justify-center text-[#111111]">
            <Shield size={20} />
          </div>
        </div>

        {/* SERVICE SECTIONS LIST */}
        <div className="space-y-6">
          {sections.map((section) => (
            <div
              key={section.id}
              className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xs overflow-hidden"
            >
              {/* SECTION HEADER */}
              <div className="p-4 bg-[#F7F7F7] border-b border-[#E5E5E5] flex items-center justify-between">
                {editingSectionId === section.id ? (
                  <div className="flex items-center gap-2 w-full max-w-sm">
                    <input
                      type="text"
                      value={editingSectionName}
                      onChange={(e) => setEditingSectionName(e.target.value)}
                      className="flex-1 min-h-[44px] px-3 bg-white border border-[#111111] rounded-lg text-sm font-bold text-[#111111] focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveSectionName(section.id)}
                      className="p-2 rounded-lg bg-[#111111] text-white min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => setEditingSectionId(null)}
                      className="p-2 rounded-lg bg-white border border-[#E5E5E5] text-[#666666] min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 className="font-extrabold text-sm text-[#111111] uppercase tracking-wider">
                        {section.name}
                      </h3>
                      <p className="text-[11px] font-semibold text-[#666666]">
                        {section.services.length} {section.services.length === 1 ? 'service' : 'services'}
                      </p>
                    </div>

                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenuKey(activeMenuKey === `sec_${section.id}` ? null : `sec_${section.id}`)
                        }
                        className="w-10 h-10 rounded-lg text-[#111111] hover:bg-[#E5E5E5] flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Section options"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {/* SECTION MENU POPOVER */}
                      {activeMenuKey === `sec_${section.id}` && (
                        <div className="absolute right-0 top-11 z-30 w-44 bg-white border border-[#E5E5E5] rounded-xl shadow-md p-1 text-left">
                          <button
                            onClick={() => {
                              setActiveMenuKey(null);
                              setEditingSectionId(section.id);
                              setEditingSectionName(section.name);
                            }}
                            className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-[#111111] hover:bg-[#F7F7F7] flex items-center gap-2 text-left cursor-pointer"
                          >
                            <Edit3 size={15} />
                            <span>Edit Section</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSectionConfirm(section)}
                            className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 text-left cursor-pointer"
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
              <div className="divide-y divide-[#E5E5E5]">
                {section.services.map((srv) => (
                  <div key={srv.id} className="p-3.5 px-4 flex items-center justify-between hover:bg-[#F7F7F7]/50">
                    {editingServiceId === srv.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editingServiceName}
                          onChange={(e) => setEditingServiceName(e.target.value)}
                          className="flex-1 min-h-[44px] px-3 bg-white border border-[#111111] rounded-lg text-sm font-semibold text-[#111111] focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveServiceName(section.id, srv.id)}
                          className="p-2 rounded-lg bg-[#111111] text-white min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => setEditingServiceId(null)}
                          className="p-2 rounded-lg bg-white border border-[#E5E5E5] text-[#666666] min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-[#111111]">
                          {srv.name}
                        </span>

                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveMenuKey(
                                activeMenuKey === `srv_${srv.id}` ? null : `srv_${srv.id}`
                              )
                            }
                            className="w-10 h-10 rounded-lg text-[#111111] hover:bg-[#E5E5E5] flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Service options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {/* SERVICE MENU POPOVER */}
                          {activeMenuKey === `srv_${srv.id}` && (
                            <div className="absolute right-0 top-10 z-30 w-36 bg-white border border-[#E5E5E5] rounded-xl shadow-md p-1 text-left">
                              <button
                                onClick={() => {
                                  setActiveMenuKey(null);
                                  setEditingServiceId(srv.id);
                                  setEditingServiceName(srv.name);
                                }}
                                className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-[#111111] hover:bg-[#F7F7F7] flex items-center gap-2 text-left cursor-pointer"
                              >
                                <Edit3 size={14} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteServiceConfirm(section.id, srv.id, srv.name)}
                                className="w-full min-h-[44px] px-3 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 text-left cursor-pointer"
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
                  <div className="p-4 text-xs font-medium text-[#666666] text-center italic">
                    No services in this section yet.
                  </div>
                )}
              </div>

              {/* ADD SERVICE FORM FOR THIS SECTION */}
              <div className="p-3 bg-[#F7F7F7]/60 border-t border-[#E5E5E5]">
                {addingServiceSectionId === section.id ? (
                  <form onSubmit={(e) => handleCreateService(section.id, e)} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      placeholder="[ Enter service name ]"
                      className="flex-1 min-h-[48px] px-3.5 bg-white border border-[#111111] rounded-xl text-sm font-medium text-[#111111] focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="min-h-[48px] px-4 bg-[#111111] text-white text-xs font-bold uppercase rounded-xl hover:bg-neutral-900 cursor-pointer"
                    >
                      ADD SERVICE
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingServiceSectionId(null);
                        setNewServiceName('');
                      }}
                      className="min-h-[48px] px-3 bg-white border border-[#E5E5E5] text-[#666666] rounded-xl cursor-pointer"
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
                    className="w-full min-h-[48px] px-4 rounded-xl border border-dashed border-[#111111] text-[#111111] hover:bg-white text-xs font-extrabold tracking-wide uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Add Service</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ADD SECTION BUTTON & FORM */}
        <div className="mt-8 pt-4 border-t border-[#E5E5E5]">
          {showAddSection ? (
            <form onSubmit={handleCreateSection} className="bg-white p-4 rounded-2xl border border-[#111111] shadow-sm space-y-3">
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider">
                Section Name
              </label>
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="[ Full Car Wash ]"
                className="w-full min-h-[48px] px-3.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-semibold text-[#111111] focus:outline-none focus:border-[#111111]"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 min-h-[48px] bg-[#111111] text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  ADD SECTION
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSection(false);
                    setNewSectionName('');
                  }}
                  className="px-4 min-h-[48px] bg-white border border-[#E5E5E5] text-[#111111] font-bold text-xs uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full min-h-[54px] bg-[#111111] hover:bg-neutral-900 active:bg-neutral-800 text-white font-extrabold text-sm tracking-wider uppercase rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
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
