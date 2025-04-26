// src/api/auth.api.ts
import api from './api';
import { AuthResponse, LoginCredentials, RegisterData, User } from '../types';

const AuthApi = {
  /**
   * Аутентификация пользователя
   * @param credentials Учетные данные для входа
   */
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    // Создаем формат данных для отправки в соответствии с ожиданиями бэкенда
    const formData = new URLSearchParams();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    
    const response = await api.post<AuthResponse>('/auth/token', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    console.log('Login response:', response.data); // Для отладки
    return response.data;
  },

  /**
   * Регистрация нового пользователя
   * @param data Данные для регистрации
   */
  register: async (data: RegisterData): Promise<User> => {
    const response = await api.post<User>('/auth/register', data);
    return response.data;
  },

  /**
   * Получение информации о текущем пользователе
   */
  getProfile: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    console.log('Profile response:', response.data); // Для отладки
    return response.data;
  },
};

export default AuthApi;