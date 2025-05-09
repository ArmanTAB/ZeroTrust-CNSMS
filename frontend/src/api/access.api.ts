// frontend/src/api/access.api.ts
import api from "./api";
import {
  AccessLog,
  AccessLogCreate,
  AccessDecision,
  AccessStatistics,
  AccessType,
} from "../types";

const AccessApi = {
  /**
   * Request access to a resource (without logging)
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
   * Request access with logging
   */
  logAccess: async (accessData: AccessLogCreate): Promise<any> => {
    const response = await api.post<any>("/access/log", accessData);
    return response.data;
  },

  /**
   * Get access logs with optional filtering
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
   * Get access statistics
   */
  getAccessStatistics: async (days: number = 7): Promise<AccessStatistics> => {
    const response = await api.get<AccessStatistics>("/access/statistics", {
      params: { days },
    });
    return response.data;
  },

  /**
   * Get access activity statistics by day
   */
  getAccessActivity: async (days: number = 7): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/activity", {
        params: { days },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching access activity:", error);
      return [];
    }
  },

  /**
   * Get security alerts
   */
  getSecurityAlerts: async (limit: number = 5): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/alerts", {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching security alerts:", error);
      return [];
    }
  },

  /**
   * Get available Google Drive folders
   */
  getGoogleDriveFolders: async (): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/google-drive/folders");
      return response.data;
    } catch (error) {
      console.error("Error fetching Google Drive folders:", error);
      return [];
    }
  },

  /**
   * Request access to a Google Drive folder
   */
  requestGoogleDriveAccess: async (
    folderId: string
  ): Promise<AccessDecision> => {
    // Get current device ID from local storage or generate a new one
    const deviceId = localStorage.getItem("device_id") || "unknown-device";

    const accessData = {
      device_id: deviceId,
      ip_address: "", // Will be determined by backend
      user_agent: navigator.userAgent,
      resource: `google-drive:folder:${folderId}`,
      access_type: AccessType.READ,
    };

    const response = await api.post<AccessDecision>(
      "/access/google-drive",
      accessData
    );
    return response.data;
  },

  /**
   * Get Google Drive access requests
   */
  getDriveAccessRequests: async (status?: string): Promise<any[]> => {
    try {
      const params = status ? { status } : {};
      const response = await api.get<any[]>("/access/google-drive/requests", {
        params,
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching Google Drive access requests:", error);
      return [];
    }
  },

  /**
   * Approve a Google Drive access request
   */
  approveDriveAccess: async (
    requestId: string,
    reason?: string
  ): Promise<any> => {
    const response = await api.post<any>(
      `/access/google-drive/requests/${requestId}/approve`,
      { reason }
    );
    return response.data;
  },

  /**
   * Reject a Google Drive access request
   */
  rejectDriveAccess: async (
    requestId: string,
    reason?: string
  ): Promise<any> => {
    const response = await api.post<any>(
      `/access/google-drive/requests/${requestId}/reject`,
      { reason }
    );
    return response.data;
  },

  /**
   * Check status of user's pending access requests
   */
  checkUserAccessRequests: async (folderId: string): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/google-drive/requests", {
        params: { folder_id: folderId, status: "pending" },
      });
      return response.data;
    } catch (error) {
      console.error("Error checking access requests status:", error);
      return [];
    }
  },

  /**
   * Synchronize Google Drive folders with the database
   */
  syncGoogleDriveFolders: async (): Promise<any> => {
    try {
      const response = await api.post<any>("/access/google-drive/sync-folders");
      return response.data;
    } catch (error) {
      console.error("Error syncing Google Drive folders:", error);
      throw error;
    }
  }
};

export default AccessApi;