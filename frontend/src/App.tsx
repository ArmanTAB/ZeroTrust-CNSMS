// src/App.tsx
import React, { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { ToastProvider } from "./store/ToastContext";
import AppRoutes from "./routes";
import "./index.css";

// AppContent component that uses the auth hooks
const AppContent = () => {
  const { loading } = useAuth();
  const [initialLoading, setInitialLoading] = useState(true);

  // Add a slight delay to prevent flickering for quick loads
  useEffect(() => {
    if (!loading) {
      // Short timeout to ensure smooth transitions
      const timer = setTimeout(() => {
        setInitialLoading(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading application...</p>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
