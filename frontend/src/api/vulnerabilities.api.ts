// src/api/vulnerabilities.api.ts
import api from "./api";
import {
  Vulnerability,
  VulnerabilityCreate,
  VulnerabilityUpdate,
} from "../types";

const VulnerabilitiesApi = {
  /**
   * Получить все уязвимости для устройства
   */
  getDeviceVulnerabilities: async (
    deviceId: string
  ): Promise<Vulnerability[]> => {
    try {
      const response = await api.get<Vulnerability[]>(
        `/devices/${deviceId}/vulnerabilities/`
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching device vulnerabilities:", error);
      return [];
    }
  },

  /**
   * Получить конкретную уязвимость по ID
   */
  getVulnerabilityById: async (
    deviceId: string,
    vulnerabilityId: string
  ): Promise<Vulnerability | null> => {
    try {
      const response = await api.get<Vulnerability>(
        `/devices/${deviceId}/vulnerabilities/${vulnerabilityId}`
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching vulnerability ${vulnerabilityId}:`, error);
      return null;
    }
  },

  /**
   * Создать новую уязвимость для устройства
   */
  createVulnerability: async (
    deviceId: string,
    vulnerabilityData: VulnerabilityCreate
  ): Promise<Vulnerability | null> => {
    try {
      const response = await api.post<Vulnerability>(
        `/devices/${deviceId}/vulnerabilities/`,
        vulnerabilityData
      );
      return response.data;
    } catch (error) {
      console.error("Error creating vulnerability:", error);
      return null;
    }
  },

  /**
   * Обновить существующую уязвимость
   */
  updateVulnerability: async (
    deviceId: string,
    vulnerabilityId: string,
    updateData: VulnerabilityUpdate
  ): Promise<Vulnerability | null> => {
    try {
      const response = await api.put<Vulnerability>(
        `/devices/${deviceId}/vulnerabilities/${vulnerabilityId}`,
        updateData
      );
      return response.data;
    } catch (error) {
      console.error(`Error updating vulnerability ${vulnerabilityId}:`, error);
      return null;
    }
  },

  /**
   * Удалить уязвимость
   */
  deleteVulnerability: async (
    deviceId: string,
    vulnerabilityId: string
  ): Promise<boolean> => {
    try {
      await api.delete(
        `/devices/${deviceId}/vulnerabilities/${vulnerabilityId}`
      );
      return true;
    } catch (error) {
      console.error(`Error deleting vulnerability ${vulnerabilityId}:`, error);
      return false;
    }
  },
};

export default VulnerabilitiesApi;
