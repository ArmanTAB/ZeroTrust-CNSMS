// src/App.tsx
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./store/AuthContext";
import { ToastProvider } from "./store/ToastContext";
import AppRoutes from "./routes";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
