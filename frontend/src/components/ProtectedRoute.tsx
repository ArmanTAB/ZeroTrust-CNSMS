// src/components/ProtectedRoute.tsx
import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

interface ProtectedRouteProps {
  redirectPath?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  redirectPath = "/login",
}) => {
  const { isAuthenticated, loading, user } = useAuth();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const location = useLocation();

  // Set initialCheckDone to true once the initial auth check is completed
  useEffect(() => {
    if (!loading) {
      setInitialCheckDone(true);
    }
  }, [loading]);

  // Show loading spinner while checking authentication
  if (loading || !initialCheckDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading your account...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  // If user is authenticated but not verified, redirect to verification
  if (isAuthenticated && user && !user.is_verified) {
    return (
      <Navigate to="/verify-email" state={{ email: user.email }} replace />
    );
  }

  // If user is authenticated, show the protected content
  return <Outlet />;
};

export default ProtectedRoute;
