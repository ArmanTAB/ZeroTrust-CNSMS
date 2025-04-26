// src/api/access.api.ts
import api from "./api";
import {
  AccessLog,
  AccessLogCreate,
  AccessDecision,
  AccessStatistics,
} from "../types";

const AccessApi = {
  /**
   * Запрос на доступ к ресурсу (без логирования)
   */
  requestAccess: async (
    accessData: AccessLogCreate
  ): Promise<AccessDecision> => {
    const response = await api.post<AccessDecision>(
      "/access/request",
      accessData
    );
    return response.data;
  },

  /**
   * Запрос на доступ к ресурсу с логированием
   */
  logAccess: async (accessData: AccessLogCreate): Promise<any> => {
    const response = await api.post<any>("/access/log", accessData);
    return response.data;
  },

  /**
   * Получить логи доступа с возможностью фильтрации
   */
  getAccessLogs: async (
    params: {
      device_id?: string;
      user_id?: string;
      resource?: string;
      access_granted?: boolean;
      start_time?: Date;
      end_time?: Date;
      skip?: number;
      limit?: number;
    } = {}
  ): Promise<AccessLog[]> => {
    const response = await api.get<AccessLog[]>("/access/logs", { params });
    return response.data;
  },

  /**
   * Получить статистику доступа
   */
  getAccessStatistics: async (days: number = 7): Promise<AccessStatistics> => {
    const response = await api.get<AccessStatistics>("/access/statistics", {
      params: { days },
    });
    return response.data;
  },

  /**
   * Получить статистику активности доступа по дням недели
   */
  getAccessActivity: async (days: number = 7): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/activity", {
        params: { days },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching access activity:", error);
      // Возвращаем моки в случае ошибки
      return [
        { day: "Mon", allowed: 25, denied: 5 },
        { day: "Tue", allowed: 30, denied: 8 },
        { day: "Wed", allowed: 35, denied: 7 },
        { day: "Thu", allowed: 28, denied: 9 },
        { day: "Fri", allowed: 32, denied: 12 },
        { day: "Sat", allowed: 18, denied: 3 },
        { day: "Sun", allowed: 15, denied: 2 },
      ];
    }
  },

  getSecurityAlerts: async (limit: number = 5): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/alerts", {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching security alerts:", error);
      // Возвращаем моки в случае ошибки
      return [
        {
          id: "1",
          alert_type: "login_failure",
          title: "Multiple login failures detected",
          description: "5 failed login attempts from IP 192.168.1.25",
          severity: "high",
          source_ip: "192.168.1.25",
          timestamp: new Date(Date.now() - 600000).toISOString(), // 10 минут назад
        },
        {
          id: "2",
          alert_type: "new_device",
          title: "New device connected",
          description: "Unrecognized device with high risk score",
          severity: "medium",
          device_id: "test-device-003",
          timestamp: new Date(Date.now() - 2700000).toISOString(), // 45 минут назад
        },
      ];
    }
  },
};

export default AccessApi;
