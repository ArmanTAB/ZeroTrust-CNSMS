// src/store/AuthContext.tsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import {
  User,
  VerificationRequest,
  ResendVerificationRequest,
  TwoFactorMethod,
} from "../types";
import AuthApi from "../api/auth.api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWith2FA: (
    email: string,
    password: string,
    totpToken: string,
    method?: TwoFactorMethod
  ) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  verifyEmail: (
    email: string,
    code: string
  ) => Promise<{ status: string; message: string }>;
  resendVerification: (
    email: string
  ) => Promise<{ status: string; message: string }>;
  checkVerificationStatus: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // Start with loading true
  const [error, setError] = useState<string | null>(null);

  // Check authentication status when the app loads
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        // If no token, we're not loading anymore
        setLoading(false);
        return;
      }

      try {
        const userData = await AuthApi.getProfile();
        setUser(userData);
      } catch (err) {
        // If token is invalid, clear it
        console.error("Authentication error:", err);
        localStorage.removeItem("token");
      } finally {
        // Finish loading regardless of the result
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null); // Clear previous errors

    try {
      // First check if the user is verified
      try {
        const verificationStatus = await AuthApi.getVerificationStatus(email);
        if (!verificationStatus.is_verified) {
          throw new Error(
            "Email not verified. Please verify your email before logging in."
          );
        }
      } catch (verificationErr: any) {
        // If it's not a 404 (user not found), it's a verification issue
        if (verificationErr.response?.status !== 404) {
          throw verificationErr;
        }
      }

      const auth = await AuthApi.login({ username: email, password });
      localStorage.setItem("token", auth.access_token);

      // Get user information after successful login
      const userData = await AuthApi.getProfile();
      setUser(userData);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || "Authentication failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loginWith2FA = async (
    email: string,
    password: string,
    totpToken: string,
    method: TwoFactorMethod = TwoFactorMethod.TOTP
  ) => {
    setLoading(true);
    setError(null); // Clear previous errors

    try {
      const auth = await AuthApi.loginWith2FA(
        email,
        password,
        totpToken,
        method
      );
      localStorage.setItem("token", auth.access_token);

      // Get user information after successful login
      const userData = await AuthApi.getProfile();
      setUser(userData);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || "Authentication failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const clearError = () => {
    setError(null);
  };

  const verifyEmail = async (email: string, code: string) => {
    try {
      const result = await AuthApi.verifyEmail({ email, code });
      return result;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || "Verification failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const result = await AuthApi.resendVerification({ email });
      return result;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail ||
        err.message ||
        "Failed to resend verification";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const checkVerificationStatus = async (email: string): Promise<boolean> => {
    try {
      const status = await AuthApi.getVerificationStatus(email);
      return status.is_verified;
    } catch (err) {
      return false;
    }
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    loginWith2FA,
    logout,
    clearError,
    verifyEmail,
    resendVerification,
    checkVerificationStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook for using the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
