import React from 'react';
import { Navigate } from 'react-router-dom';
import { isOwnerAuthenticated, isStaffAuthenticated } from '../config/authConfig';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  if (!isOwnerAuthenticated()) {
    return <Navigate to="/owner/login" replace />;
  }

  return children;
};

export const OwnerProtectedRoute: React.FC<ProtectedRouteProps> = ProtectedRoute;

export const StaffProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  if (!isStaffAuthenticated()) {
    return <Navigate to="/staff/login" replace />;
  }

  return children;
};
