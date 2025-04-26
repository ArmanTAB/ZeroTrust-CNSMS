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
};

export default AccessApi;
