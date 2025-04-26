// src/api/devices.api.ts
import api from "./api";
import { Device, DeviceCreate, DeviceUpdate, DeviceStatus } from "../types";

const DevicesApi = {
  /**
   * Получить все устройства с возможностью фильтрации
   */
  getAllDevices: async (
    params: {
      skip?: number;
      limit?: number;
      device_type?: string;
      status?: string;
      is_trusted?: boolean;
    } = {}
  ): Promise<Device[]> => {
    const response = await api.get<Device[]>("/devices/", { params });
    return response.data;
  },

  /**
   * Получить устройство по ID
   */
  getDeviceById: async (deviceId: string): Promise<Device> => {
    const response = await api.get<Device>(`/devices/${deviceId}`);
    return response.data;
  },

  /**
   * Получить оценку рисков для устройства
   */
  getDeviceRisk: async (deviceId: string): Promise<any> => {
    const response = await api.get<any>(`/devices/${deviceId}/risk`);
    return response.data;
  },

  /**
   * Зарегистрировать новое устройство
   */
  registerDevice: async (device: DeviceCreate): Promise<Device> => {
    const response = await api.post<Device>("/devices/register", device);
    return response.data;
  },

  /**
   * Обновить информацию об устройстве
   */
  updateDevice: async (
    deviceId: string,
    data: DeviceUpdate
  ): Promise<Device> => {
    const response = await api.put<Device>(`/devices/${deviceId}`, data);
    return response.data;
  },

  /**
   * Обновить статус устройства
   */
  updateDeviceStatus: async (
    deviceId: string,
    status: DeviceStatus
  ): Promise<any> => {
    const response = await api.put<any>(`/devices/${deviceId}/status`, {
      status,
    });
    return response.data;
  },

  /**
   * Получить статистику по устройствам
   * Это метод для дашборда, на бэкенде его нет, поэтому мы будем имитировать его
   */
  // Обновляем метод getDeviceStatistics, чтобы использовать реальный API
  getDeviceStatistics: async (): Promise<any> => {
    try {
      const response = await api.get<any>("/devices/statistics");
      return response.data;
    } catch (error) {
      console.error("Error fetching device statistics:", error);
      // Возвращаем нулевые значения в случае ошибки
      return {
        total: 0,
        active: 0,
        inactive: 0,
        quarantined: 0,
        blocked: 0,
        pending: 0,
        trusted: 0,
        untrusted: 0,
        risk_distribution: {
          low: 0,
          medium: 0,
          high: 0,
        },
      };
    }
  },
};

export default DevicesApi;
