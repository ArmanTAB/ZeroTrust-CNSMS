// src/api/auth.api.ts
import api from "./api";
import {
  AuthResponse,
  LoginCredentials,
  RegisterData,
  User,
  VerificationRequest,
  ResendVerificationRequest,
  VerificationStatus,
} from "../types";

const AuthApi = {
  /**
   * Аутентификация пользователя
   * @param credentials Учетные данные для входа
   */
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    // Создаем формат данных для отправки в соответствии с ожиданиями бэкенда
    const formData = new URLSearchParams();
    formData.append("username", credentials.username);
    formData.append("password", credentials.password);

    const response = await api.post<AuthResponse>(
      "/auth/token",
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Login response:", response.data); // Для отладки
    return response.data;
  },

  /**
   * Регистрация нового пользователя
   * @param data Данные для регистрации
   */
  register: async (data: RegisterData): Promise<User> => {
    const response = await api.post<User>("/auth/register", data);
    return response.data;
  },

  /**
   * Получение информации о текущем пользователе
   */
  getProfile: async (): Promise<User> => {
    const response = await api.get<User>("/auth/me");
    console.log("Profile response:", response.data); // Для отладки
    return response.data;
  },

  /**
   * Verify user email with verification code
   * @param data Verification data containing email and code
   */
  verifyEmail: async (
    data: VerificationRequest
  ): Promise<{ status: string; message: string }> => {
    const response = await api.post<{ status: string; message: string }>(
      "/auth/verify-email",
      data
    );
    return response.data;
  },

  /**
   * Resend verification email
   * @param data Contains email to resend verification to
   */
  resendVerification: async (
    data: ResendVerificationRequest
  ): Promise<{ status: string; message: string }> => {
    const response = await api.post<{ status: string; message: string }>(
      "/auth/resend-verification",
      data
    );
    return response.data;
  },

  /**
   * Check verification status of a user
   * @param email User's email to check
   */
  getVerificationStatus: async (email: string): Promise<VerificationStatus> => {
    const response = await api.get<VerificationStatus>(
      `/auth/verification-status/${email}`
    );
    return response.data;
  },

  checkEmailExists: async (email: string): Promise<boolean> => {
    try {
      await api.get<VerificationStatus>(`/auth/verification-status/${email}`);
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  },
};

export default AuthApi;
