// src/components/Layout/MainLayout.tsx
import React, { useState } from "react";
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

  // Обработчик выхода из системы
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Проверка активного маршрута
  const isActiveRoute = (route: string) => {
    return location.pathname === route;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Боковая панель */}
      <div className="hidden md:flex flex-col w-64 bg-blue-800 text-white">
        <div className="flex items-center justify-center h-16 border-b border-blue-700">
          <h2 className="text-lg font-semibold">Zero Trust Security</h2>
        </div>
        <div className="flex flex-col flex-1 overflow-y-auto">
          <nav className="flex-1 px-2 py-4">
            <Link
              to="/dashboard"
              className={`flex items-center px-4 py-2 mt-2 text-sm rounded-md ${
                isActiveRoute("/dashboard")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-700"
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
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
              Dashboard
            </Link>
            <Link
              to="/devices"
              className={`flex items-center px-4 py-2 mt-2 text-sm rounded-md ${
                isActiveRoute("/devices")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-700"
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
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
              Devices
            </Link>
            <Link
              to="/access-logs"
              className={`flex items-center px-4 py-2 mt-2 text-sm rounded-md ${
                isActiveRoute("/access-logs")
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-700"
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Access Logs
            </Link>
          </nav>
        </div>
        <div className="p-4 border-t border-blue-700">
          <div className="flex items-center">
            <div>
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-blue-200">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full flex items-center justify-center px-4 py-2 text-sm text-blue-100 bg-blue-700 rounded-md hover:bg-blue-600"
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

      {/* Мобильное меню */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between h-16 bg-white border-b border-gray-200 md:hidden">
          <div className="flex items-center px-4">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-500 focus:outline-none focus:text-gray-700"
              aria-label="Toggle mobile menu"
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
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h2 className="ml-4 text-lg font-semibold">Zero Trust Security</h2>
          </div>
        </div>

        {/* Мобильная навигация */}
        {isMobileMenuOpen && (
          <div className="absolute inset-x-0 top-16 bg-blue-800 z-10 md:hidden">
            <nav className="flex flex-col p-4">
              <Link
                to="/dashboard"
                className={`flex items-center px-4 py-2 text-sm rounded-md ${
                  isActiveRoute("/dashboard")
                    ? "bg-blue-700 text-white"
                    : "text-blue-100 hover:bg-blue-700"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/devices"
                className={`flex items-center px-4 py-2 mt-2 text-sm rounded-md ${
                  isActiveRoute("/devices")
                    ? "bg-blue-700 text-white"
                    : "text-blue-100 hover:bg-blue-700"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Devices
              </Link>
              <Link
                to="/access-logs"
                className={`flex items-center px-4 py-2 mt-2 text-sm rounded-md ${
                  isActiveRoute("/access-logs")
                    ? "bg-blue-700 text-white"
                    : "text-blue-100 hover:bg-blue-700"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Access Logs
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center px-4 py-2 mt-2 text-sm text-blue-100 rounded-md hover:bg-blue-700"
              >
                Sign Out
              </button>
            </nav>
          </div>
        )}

        {/* Основное содержимое */}
        <main className="flex-1 overflow-y-auto bg-gray-100">
          <div className="container mx-auto px-4 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
