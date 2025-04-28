// src/api/api.ts
import axios, { AxiosRequestConfig } from "axios";

// Base API URL
const API_URL = "http://localhost:8000";

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global error handler
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle authentication errors (401)
    if (error.response && error.response.status === 401) {
      // Clear invalid token
      localStorage.removeItem("token");

      // Get current page path to potentially redirect back after login
      const currentPath = window.location.pathname;

      // Only redirect to login if we're not already on a non-protected route
      const nonProtectedRoutes = [
        "/login",
        "/register",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
      ];
      if (!nonProtectedRoutes.some((route) => currentPath.startsWith(route))) {
        // Store current location to redirect back after login
        sessionStorage.setItem("redirectAfterLogin", currentPath);

        // Use window.location for a full page refresh
        // This is better than using React Router navigate for auth-related full resets
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
