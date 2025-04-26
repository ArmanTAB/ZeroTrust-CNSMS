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
  getDeviceStatistics: async (): Promise<any> => {
    try {
      // Получаем все устройства
      const devices = await DevicesApi.getAllDevices();

      // Рассчитываем статистику
      const stats = {
        total: devices.length,
        active: devices.filter((d) => d.status === "active").length,
        inactive: devices.filter((d) => d.status === "inactive").length,
        quarantined: devices.filter((d) => d.status === "quarantined").length,
        blocked: devices.filter((d) => d.status === "blocked").length,
        pending: devices.filter((d) => d.status === "pending").length,
        trusted: devices.filter((d) => d.is_trusted).length,
        untrusted: devices.filter((d) => !d.is_trusted).length,
      };

      return stats;
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
      };
    }
  },
};

export default DevicesApi;
