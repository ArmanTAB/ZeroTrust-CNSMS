// src/api/api.ts
import axios, { AxiosRequestConfig } from "axios";

// Базовый URL API
const API_URL = "http://localhost:8000";

// Создаем экземпляр axios с базовой конфигурацией
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Интерцептор для добавления токена авторизации
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

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Если ошибка авторизации (401), перенаправляем на страницу логина
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      // Важно: используйте navigate вместо window.location.href
      // window.location.href = "/login"; // Эта строка вызывает перезагрузку страницы
    }
    return Promise.reject(error);
  }
);

export default api;
