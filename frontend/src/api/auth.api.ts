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
  PasswordResetRequest,
  PasswordResetVerifyRequest,
  TOTPSetupResponse,
  TOTPStatusResponse,
  TwoFactorMethod,
  Auth2FAResponse,
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

  /**
   * Request password reset code
   * @param email The email to send the reset code to
   */
  requestPasswordReset: async (
    email: string
  ): Promise<{ status: string; message: string }> => {
    const response = await api.post<{ status: string; message: string }>(
      "/auth/request-password-reset",
      { email }
    );
    return response.data;
  },

  /**
   * Verify password reset code and set new password
   * @param data Contains email, reset code, and new password
   */
  resetPassword: async (
    data: PasswordResetVerifyRequest
  ): Promise<{ status: string; message: string }> => {
    const response = await api.post<{ status: string; message: string }>(
      "/auth/reset-password",
      data
    );
    return response.data;
  },

  /**
   * Get TOTP setup details (QR code & secret)
   */
  setupTOTP: async (): Promise<TOTPSetupResponse> => {
    const response = await api.post<TOTPSetupResponse>("/auth/totp/setup");
    return response.data;
  },

  /**
   * Verify TOTP token to complete setup
   */
  verifyTOTP: async (token: string): Promise<any> => {
    const response = await api.post<any>("/auth/totp/verify", { token });
    return response.data;
  },

  /**
   * Disable TOTP for the current user
   */
  disableTOTP: async (): Promise<any> => {
    const response = await api.post<any>("/auth/totp/disable");
    return response.data;
  },

  /**
   * Get TOTP status
   */
  getTOTPStatus: async (): Promise<TOTPStatusResponse> => {
    const response = await api.get<TOTPStatusResponse>("/auth/totp/status");
    return response.data;
  },

  loginWith2FA: async (
    email: string,
    password: string,
    totpToken: string,
    method: TwoFactorMethod = TwoFactorMethod.TOTP
  ): Promise<AuthResponse> => {
    // Create formData to maintain compatibility with backend
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    // Use scope to send the token with the appropriate prefix
    if (method === TwoFactorMethod.TOTP) {
      formData.append("scope", `totp:${totpToken}`);
    } else {
      formData.append("scope", `twilio:${totpToken}`);
    }

    const response = await api.post<AuthResponse>(
      "/auth/token",
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  },

  setupPhoneVerification: async (
    phone_number: string,
    method: TwoFactorMethod
  ): Promise<any> => {
    const response = await api.post<any>("/auth/twilio/setup", {
      phone_number,
      method,
    });
    return response.data;
  },

  verifyPhoneNumber: async (
    phone_number: string,
    code: string,
    method: TwoFactorMethod
  ): Promise<any> => {
    const response = await api.post<any>("/auth/twilio/verify", {
      phone_number,
      code,
      method,
    });
    return response.data;
  },

  sendTwilioCode: async (method: TwoFactorMethod): Promise<any> => {
    const response = await api.post<any>("/auth/twilio/send-code", {
      method,
    });
    return response.data;
  },

  updatePreferred2FAMethod: async (method: TwoFactorMethod): Promise<any> => {
    const response = await api.post<any>("/auth/2fa/method", {
      method,
    });
    return response.data;
  },

  disable2FAMethod: async (method: TwoFactorMethod): Promise<any> => {
    const response = await api.post<any>("/auth/2fa/disable", {
      method,
    });
    return response.data;
  },
  get2FAStatus: async (): Promise<TOTPStatusResponse> => {
    const response = await api.get<TOTPStatusResponse>("/auth/totp/status");
    return response.data;
  },

  // Update the existing check2FARequired function
  check2FARequired: async (
    email: string,
    password: string
  ): Promise<Auth2FAResponse> => {
    const response = await api.post<Auth2FAResponse>("/auth/login/2fa-check", {
      email,
      password,
    });
    return response.data;
  },
};

export default AuthApi;
