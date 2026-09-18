import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ModeSelection } from './pages/ModeSelection';
import { OwnerLogin } from './pages/OwnerLogin';
import { StaffLogin } from './pages/StaffLogin';
import { OwnerStaff } from './pages/OwnerStaff';
import { OwnerServices } from './pages/OwnerServices';
import { OwnerMessages } from './pages/OwnerMessages';
import { JobSheet } from './components/JobSheet';
import { TodaysVehicles } from './components/TodaysVehicles';
import { TotalVehicles } from './components/TotalVehicles';
import { OwnerProtectedRoute, StaffProtectedRoute } from './components/ProtectedRoute';
import { initTheme } from './utils/themeStorage';

import { syncJobsFromSupabase } from './utils/draftStorage';
import { getStaffProfiles } from './utils/staffStorage';
import { syncServiceSectionsFromSupabase } from './utils/serviceStorage';
import { syncMessageTemplatesFromSupabase } from './utils/templateStorage';
import { NotificationProvider } from './components/NotificationSystem';

export function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    initTheme();

    // Background sync data from Supabase
    syncJobsFromSupabase().catch(() => {});
    getStaffProfiles().catch(() => {});
    syncServiceSectionsFromSupabase().catch(() => {});
    syncMessageTemplatesFromSupabase().catch(() => {});

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
    }
    setDeferredPrompt(null);
  };

  // Staff Views (Protected for Authenticated Staff)
  const renderStaffJobSheet = () => (
    <StaffProtectedRoute>
      <JobSheet
        mode="staff"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </StaffProtectedRoute>
  );

  const renderStaffTodaysVehicles = () => (
    <StaffProtectedRoute>
      <TodaysVehicles
        mode="staff"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </StaffProtectedRoute>
  );

  const renderStaffTotalVehicles = () => (
    <StaffProtectedRoute>
      <TotalVehicles
        mode="staff"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </StaffProtectedRoute>
  );

  // Owner Views (Protected for Authenticated Owner)
  const renderOwnerJobSheet = () => (
    <OwnerProtectedRoute>
      <JobSheet
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  const renderOwnerTodaysVehicles = () => (
    <OwnerProtectedRoute>
      <TodaysVehicles
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  const renderOwnerTotalVehicles = () => (
    <OwnerProtectedRoute>
      <TotalVehicles
        mode="owner"
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  const renderOwnerStaff = () => (
    <OwnerProtectedRoute>
      <OwnerStaff
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  const renderOwnerServices = () => (
    <OwnerProtectedRoute>
      <OwnerServices
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  const renderOwnerMessages = () => (
    <OwnerProtectedRoute>
      <OwnerMessages
        deferredPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />
    </OwnerProtectedRoute>
  );

  return (
    <NotificationProvider>
      <BrowserRouter>
      <Routes>
        {/* Mode Selection */}
        <Route path="/" element={<ModeSelection />} />

        {/* Staff Authentication & Protected Routes */}
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff" element={renderStaffJobSheet()} />
        <Route path="/staff/today" element={renderStaffTodaysVehicles()} />
        <Route path="/staff/vehicles" element={renderStaffTotalVehicles()} />
        <Route path="/staff/job" element={renderStaffJobSheet()} />

        {/* Owner Authentication & Protected Routes */}
        <Route path="/owner/login" element={<OwnerLogin />} />
        <Route path="/owner" element={renderOwnerJobSheet()} />
        <Route path="/owner/today" element={renderOwnerTodaysVehicles()} />
        <Route path="/owner/vehicles" element={renderOwnerTotalVehicles()} />
        <Route path="/owner/job" element={renderOwnerJobSheet()} />
        <Route path="/owner/staff" element={renderOwnerStaff()} />
        <Route path="/owner/services" element={renderOwnerServices()} />
        <Route path="/owner/messages" element={renderOwnerMessages()} />

        {/* Catch-all redirect to / */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}

export default App;
