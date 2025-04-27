// src/store/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { User, VerificationRequest, ResendVerificationRequest } from '../types';
import AuthApi from '../api/auth.api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  verifyEmail: (email: string, code: string) => Promise<{ status: string; message: string }>;
  resendVerification: (email: string) => Promise<{ status: string; message: string }>;
  checkVerificationStatus: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(false); // Изменено на false для начала
  const [error, setError] = useState<string | null>(null);

  // Проверяем, авторизован ли пользователь при первой загрузке
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        setLoading(true);
        try {
          const userData = await AuthApi.getProfile();
          setUser(userData);
        } catch (err) {
          // Если токен невалидный, очищаем localStorage
          localStorage.removeItem('token');
          console.error('Authentication error:', err);
        } finally {
          setLoading(false);
        }
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
          throw new Error("Email not verified. Please verify your email before logging in.");
        }
      } catch (verificationErr: any) {
        // If it's not a 404 (user not found), it's a verification issue
        if (verificationErr.response?.status !== 404) {
          throw verificationErr;
        }
      }
      
      const auth = await AuthApi.login({ username: email, password });
      localStorage.setItem('token', auth.access_token);
      
      // Получаем информацию о пользователе после успешной авторизации
      const userData = await AuthApi.getProfile();
      setUser(userData);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Authentication failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
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
      const errorMessage = err.response?.data?.detail || err.message || 'Verification failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };
  
  const resendVerification = async (email: string) => {
    try {
      const result = await AuthApi.resendVerification({ email });
      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to resend verification';
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
    logout,
    clearError,
    verifyEmail,
    resendVerification,
    checkVerificationStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Хук для использования контекста аутентификации
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};