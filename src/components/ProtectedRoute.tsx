import React from 'react';
import { Navigate } from 'react-router-dom';
import { isStaffAuthenticated } from '../config/authConfig';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

export const OwnerProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isOwner, loadingAuth, user } = useAuth();

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  // If they are not logged in at all, or not an owner
  if (!user || !isOwner) {
    return <Navigate to="/owner/login" replace />;
  }

  return children;
};

export const StaffProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  if (!isStaffAuthenticated()) {
    return <Navigate to="/staff/login" replace />;
  }

  return children;
};

