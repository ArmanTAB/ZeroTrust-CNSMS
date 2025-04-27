// src/components/Layout/MainLayout.tsx
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

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
      case "admin":
        return "bg-purple-600";
      case "security_analyst":
        return "bg-blue-600";
      case "network_admin":
        return "bg-green-600";
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - desktop */}
      <div
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 z-10 transition-all duration-300 ease-in-out ${getSidebarWidth()}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col flex-grow bg-gradient-to-b from-blue-800 to-blue-900 overflow-y-auto">
          <div className="flex items-center justify-between h-16 bg-blue-900 bg-opacity-40 px-4">
            <div
              className={`flex items-center ${
                isSidebarCollapsed && !isHovering ? "justify-center w-full" : ""
              }`}
            >
              <svg
                className="h-8 w-8 text-blue-300"
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
              className={`text-white hover:text-blue-200 transition-opacity duration-200 ${
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
          <nav className="flex-1 px-2 py-4 space-y-1">
            <Link
              to="/dashboard"
              className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 group ${
                isActiveRoute("/dashboard")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-800 hover:text-white"
              } ${isSidebarCollapsed && !isHovering ? "justify-center" : ""}`}
            >
              <svg
                className={`flex-shrink-0 w-6 h-6 transition-colors duration-200 ${
                  isActiveRoute("/dashboard")
                    ? "text-white"
                    : "text-blue-300 group-hover:text-white"
                }`}
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
              <span
                className={`text-sm font-medium transition-opacity duration-200 ml-3 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                Dashboard
              </span>
            </Link>
            <Link
              to="/devices"
              className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 group ${
                isActiveRoute("/devices")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-800 hover:text-white"
              } ${isSidebarCollapsed && !isHovering ? "justify-center" : ""}`}
            >
              <svg
                className={`flex-shrink-0 w-6 h-6 transition-colors duration-200 ${
                  isActiveRoute("/devices")
                    ? "text-white"
                    : "text-blue-300 group-hover:text-white"
                }`}
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
              <span
                className={`text-sm font-medium transition-opacity duration-200 ml-3 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                Devices
              </span>
            </Link>
            <Link
              to="/access-logs"
              className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 group ${
                isActiveRoute("/access-logs")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-800 hover:text-white"
              } ${isSidebarCollapsed && !isHovering ? "justify-center" : ""}`}
            >
              <svg
                className={`flex-shrink-0 w-6 h-6 transition-colors duration-200 ${
                  isActiveRoute("/access-logs")
                    ? "text-white"
                    : "text-blue-300 group-hover:text-white"
                }`}
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
              <span
                className={`text-sm font-medium transition-opacity duration-200 ml-3 ${
                  isSidebarCollapsed && !isHovering
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                Access Logs
              </span>
            </Link>
          </nav>
          <div
            className={`p-4 bg-blue-900 bg-opacity-40 transition-all duration-200 ${
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
                <p className="text-xs text-blue-200 capitalize">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`mt-3 flex items-center justify-center text-sm text-white bg-blue-700 bg-opacity-50 rounded-md hover:bg-blue-600 transition-all duration-200 ${
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
                className="text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 p-1"
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
              className="fixed inset-y-0 left-0 w-full max-w-xs bg-gradient-to-b from-blue-800 to-blue-900 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between h-16 px-6 bg-blue-900 bg-opacity-40">
                <div className="flex items-center">
                  <svg
                    className="h-8 w-8 text-blue-300"
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
                      <p className="text-xs text-blue-200 capitalize">
                        {user?.role?.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>
                <nav className="space-y-1">
                  <Link
                    to="/dashboard"
                    className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 ${
                      isActiveRoute("/dashboard")
                        ? "bg-blue-700 text-white"
                        : "text-blue-100 hover:bg-blue-800 hover:text-white"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
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
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    to="/devices"
                    className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 ${
                      isActiveRoute("/devices")
                        ? "bg-blue-700 text-white"
                        : "text-blue-100 hover:bg-blue-800 hover:text-white"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
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
                    <span>Devices</span>
                  </Link>
                  <Link
                    to="/access-logs"
                    className={`flex items-center px-3 py-3 rounded-md transition-all duration-200 ${
                      isActiveRoute("/access-logs")
                        ? "bg-blue-700 text-white"
                        : "text-blue-100 hover:bg-blue-800 hover:text-white"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
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
                    <span>Access Logs</span>
                  </Link>
                </nav>
                <div className="mt-10 px-3">
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center px-4 py-2 text-sm text-white bg-blue-700 bg-opacity-50 rounded-md hover:bg-blue-600 transition-colors duration-200"
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
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="container mx-auto px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
