// src/components/Layout/MainLayout.tsx (updated with role-based access)
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { UserRole } from "../../types";

interface MainLayoutProps {
  children: React.ReactNode;
}

// Helper function to check if user has access to a specific route
const hasRouteAccess = (role: UserRole | undefined, route: string): boolean => {
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

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const checkWindowWidth = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
      }
    };

    // Check on mount
    checkWindowWidth();

    // Add resize listener
    window.addEventListener("resize", checkWindowWidth);

    // Cleanup
    return () => window.removeEventListener("resize", checkWindowWidth);
  }, []);

  // Handle scrolling effect for header
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle logout
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Check active route
  const isActiveRoute = (route: string) => {
    // Don't show as active if user doesn't have access to this route
    if (!hasRouteAccess(user?.role, route)) {
      return false;
    }

    if (route === "/agent") {
      return location.pathname === route;
    }
    return (
      location.pathname === route || location.pathname.startsWith(route + "/")
    );
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user?.full_name) return "U";

    const names = user.full_name.split(" ");
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (
      names[0].charAt(0) + names[names.length - 1].charAt(0)
    ).toUpperCase();
  };

  // Get role color
  const getRoleColor = () => {
    switch (user?.role) {
      case UserRole.ADMIN:
        return "bg-[#7A2048]"; // Burgundy red
      case UserRole.SECURITY_ANALYST:
        return "bg-[#408EC6]"; // Royal blue
      case UserRole.NETWORK_ADMIN:
        return "bg-[#1E2761]"; // Midnight blue
      default:
        return "bg-gray-600";
    }
  };

  // Hover handlers for sidebar
  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Dynamic sidebar width
  const getSidebarWidth = () => {
    if (isSidebarCollapsed && !isHovering) {
      return "w-16";
    }
    return "w-64";
  };

  // NavLink component for consistency and conditional rendering based on role
  const NavLink = ({
    to,
    label,
    icon,
    onClick,
  }: {
    to: string;
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
  }) => {
    // Don't render if user doesn't have access to this route
    if (!hasRouteAccess(user?.role, to)) {
      return null;
    }

    return (
      <Link
        to={to}
        className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 group ${
          isActiveRoute(to)
            ? "bg-[#408EC6] text-white"
            : "text-gray-100 hover:bg-[#2a3980] hover:text-white"
        } ${isSidebarCollapsed && !isHovering ? "justify-center" : ""}`}
        onClick={onClick}
      >
        <span
          className={`flex-shrink-0 w-6 h-6 transition-colors duration-200 ${
            isActiveRoute(to)
              ? "text-white"
              : "text-gray-300 group-hover:text-white"
          }`}
        >
          {icon}
        </span>
        <span
          className={`text-sm font-medium transition-opacity duration-200 ml-3 ${
            isSidebarCollapsed && !isHovering
              ? "opacity-0 w-0 overflow-hidden"
              : "opacity-100"
          }`}
        >
          {label}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - desktop */}
      <div
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 z-10 transition-all duration-300 ease-in-out ${getSidebarWidth()}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col flex-grow bg-gradient-to-b from-[#1E2761] to-[#1e2761f2] overflow-y-auto">
          <div className="flex items-center justify-between h-16 bg-[#1E2761] bg-opacity-40 px-4">
            <div
              className={`flex items-center ${
                isSidebarCollapsed && !isHovering ? "justify-center w-full" : ""
              }`}
            >
              <svg
                className="h-8 w-8 text-[#408EC6]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <h2
                className={`ml-2 text-xl font-semibold text-white transition-opacity duration-200 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                ZT Security
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={`text-white hover:text-[#408EC6] transition-opacity duration-200 ${
                isSidebarCollapsed && !isHovering ? "opacity-0" : "opacity-100"
              }`}
              aria-label={
                isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isSidebarCollapsed ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Navigation menu */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {/* Main Navigation Links - Only show links the user has access to */}
            <NavLink
              to="/dashboard"
              label="Dashboard"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              }
            />

            <NavLink
              to="/devices"
              label="Devices"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
              }
            />

            <NavLink
              to="/access-logs"
              label="Access Logs"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
            />

            <NavLink
              to="/google-drive"
              label="Google Drive"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              }
            />

            {/* Agent Management Section - Only show for Admin */}
            {user?.role === UserRole.ADMIN && (
              <div
                className={`pt-4 mt-4 border-t border-gray-700 ${
                  isSidebarCollapsed && !isHovering ? "mx-2" : "mx-3"
                }`}
              >
                <p
                  className={`px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider ${
                    isSidebarCollapsed && !isHovering ? "hidden" : "block"
                  }`}
                >
                  Agent Management
                </p>
              </div>
            )}

            <NavLink
              to="/agent"
              label="Agent Dashboard"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              }
            />

            <NavLink
              to="/agent/users"
              label="Agent Users"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              }
            />

            <NavLink
              to="/agent/rules"
              label="Agent Rules"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
            />

            <NavLink
              to="/profile"
              label="Profile"
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              }
            />
          </nav>

          <div
            className={`p-4 bg-[#1E2761] bg-opacity-60 transition-all duration-200 ${
              isSidebarCollapsed && !isHovering ? "py-2 px-2" : ""
            }`}
          >
            <div className="flex items-center">
              <div
                className={`${
                  isSidebarCollapsed && !isHovering
                    ? "w-8 h-8 mx-auto"
                    : "w-10 h-10"
                } rounded-full flex items-center justify-center text-white font-semibold ${getRoleColor()}`}
              >
                {getInitials()}
              </div>
              <div
                className={`ml-3 transition-opacity duration-200 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                <p className="text-sm font-medium text-white">
                  {user?.full_name}
                </p>
                <p className="text-xs text-gray-300 capitalize">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`mt-3 flex items-center justify-center text-sm text-white bg-[#7A2048] bg-opacity-80 rounded-md hover:bg-[#7A2048] transition-all duration-200 ${
                isSidebarCollapsed && !isHovering
                  ? "w-8 h-8 mx-auto p-0"
                  : "w-full px-4 py-2"
              }`}
              aria-label={
                isSidebarCollapsed && !isHovering ? "Sign out" : undefined
              }
            >
              <svg
                className={`w-4 h-4 ${
                  isSidebarCollapsed && !isHovering ? "" : "mr-2"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span
                className={`transition-opacity duration-200 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        className={`flex flex-col flex-1 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed && !isHovering ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Top navbar */}
        <div
          className={`sticky top-0 z-10 ${
            isScrolled ? "bg-white shadow-md" : "bg-transparent"
          } transition-all duration-200`}
        >
          <div className="flex items-center justify-between h-16 px-4 md:px-6">
            <div className="flex items-center md:hidden">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#408EC6] p-1"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
              <h2 className="ml-3 text-lg font-medium md:hidden text-gray-900">
                ZT Security
              </h2>
            </div>
            <div className="flex items-center ml-auto">
              <div className="relative">
                <div className="md:hidden">
                  <button
                    type="button"
                    className="flex items-center text-sm rounded-full focus:outline-none"
                    onClick={handleLogout}
                    aria-label="Sign out"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getRoleColor()}`}
                    >
                      {getInitials()}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div
              className="fixed inset-y-0 left-0 w-full max-w-xs bg-gradient-to-b from-[#1E2761] to-[#1e2761f2] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between h-16 px-6 bg-[#1E2761] bg-opacity-40">
                <div className="flex items-center">
                  <svg
                    className="h-8 w-8 text-[#408EC6]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <h2 className="ml-2 text-xl font-semibold text-white">
                    ZT Security
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-white hover:text-gray-200"
                  aria-label="Close menu"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="px-2 py-4">
                <div className="px-4 py-3 mb-6">
                  <div className="flex items-center mb-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getRoleColor()}`}
                    >
                      {getInitials()}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-white">
                        {user?.full_name}
                      </p>
                      <p className="text-xs text-gray-300 capitalize">
                        {user?.role?.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>
                <nav className="space-y-1">
                  {/* Mobile navigation links - Only show what the user has access to */}
                  {hasRouteAccess(user?.role, "/dashboard") && (
                    <NavLink
                      to="/dashboard"
                      label="Dashboard"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/devices") && (
                    <NavLink
                      to="/devices"
                      label="Devices"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/access-logs") && (
                    <NavLink
                      to="/access-logs"
                      label="Access Logs"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/google-drive") && (
                    <NavLink
                      to="/google-drive"
                      label="Google Drive"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {/* Agent Management Section - Only for Admin */}
                  {user?.role === UserRole.ADMIN && (
                    <div className="pt-4 mt-4 border-t border-gray-700">
                      <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Agent Management
                      </p>
                    </div>
                  )}

                  {hasRouteAccess(user?.role, "/agent") && (
                    <NavLink
                      to="/agent"
                      label="Agent Dashboard"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/agent/users") && (
                    <NavLink
                      to="/agent/users"
                      label="Agent Users"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/agent/rules") && (
                    <NavLink
                      to="/agent/rules"
                      label="Agent Rules"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}

                  {hasRouteAccess(user?.role, "/profile") && (
                    <NavLink
                      to="/profile"
                      label="Profile"
                      icon={
                        <svg
                          className="w-6 h-6 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      }
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  )}
                </nav>

                <div className="mt-10 px-3">
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center px-4 py-2 text-sm text-white bg-[#7A2048] bg-opacity-80 rounded-md hover:bg-[#7A2048] transition-colors duration-200"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-gray-50 w-full">
          <div className="container mx-auto px-4 py-6 md:px-6 md:py-8 max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
