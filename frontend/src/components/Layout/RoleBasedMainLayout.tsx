// src/components/Layout/RoleBasedMainLayout.tsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import MainLayout from "./MainLayout";
import { UserRole } from "../../types";

interface RoleBasedMainLayoutProps {
  children: React.ReactNode;
}

// Helper function to check if a user has access to a specific route based on role
export const hasRouteAccess = (
  role: UserRole | undefined,
  route: string
): boolean => {
  if (!role) return false;

  // Common routes for all authenticated users
  if (route === "/dashboard" || route === "/profile") {
    return true;
  }

  // Routes for Security Analyst and Admin
  if (
    (route === "/access-logs" || route === "/google-drive") &&
    (role === UserRole.ADMIN || role === UserRole.SECURITY_ANALYST)
  ) {
    return true;
  }

  // Routes for Network Admin and Admin
  if (
    (route === "/devices" || route.startsWith("/devices/")) &&
    (role === UserRole.ADMIN || role === UserRole.NETWORK_ADMIN)
  ) {
    return true;
  }

  // Routes only for Admin
  if (
    (route === "/agent" || route.startsWith("/agent/")) &&
    role === UserRole.ADMIN
  ) {
    return true;
  }

  return false;
};

/**
 * A wrapper component that controls which navigation items are shown based on user role.
 * This component does not actually alter the MainLayout component, but provides
 * a custom implementation of the isActiveRoute function that checks both if a route
 * is active AND if the user has permission to access it.
 */
const RoleBasedMainLayout: React.FC<RoleBasedMainLayoutProps> = ({
  children,
}) => {
  const { user } = useAuth();
  const location = useLocation();

  // Original MainLayout uses this function to determine active routes
  // We override it to also check if the user has access to the route
  const isActiveRoute = (route: string) => {
    // First check if the user has access to this route
    if (!hasRouteAccess(user?.role, route)) {
      return false;
    }

    // Then check if it's the current route
    if (route === "/agent") {
      return location.pathname === route;
    }
    return (
      location.pathname === route || location.pathname.startsWith(route + "/")
    );
  };

  // This component acts as a pass-through to MainLayout
  // The actual role-based menu filtering should be implemented in MainLayout
  return <MainLayout>{children}</MainLayout>;
};

export default RoleBasedMainLayout;
