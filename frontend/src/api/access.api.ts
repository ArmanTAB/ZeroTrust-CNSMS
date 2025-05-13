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
      throw error; // Re-throw to let components handle the error
    }
  },

  requestGoogleDriveAccess: async (
    folderId: string,
    emailAddress?: string
  ): Promise<any> => {
    // Get current device ID from local storage or generate a new one
    const getDeviceId = () => {
      let deviceId = localStorage.getItem("device_id");
      if (!deviceId) {
        deviceId = `web-${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem("device_id", deviceId);
      }
      return deviceId;
    };

    // Create a standard resource string
    const resource = `google-drive:folder:${folderId}`;

    const accessData = {
      device_id: getDeviceId(),
      ip_address: "127.0.0.1", // Provide a default IP
      user_agent: navigator.userAgent,
      resource: resource,
      access_type: AccessType.READ,
      timestamp: new Date().toISOString(), // Make sure this is at the top level of the object
      context: {
        email_for_access: emailAddress, // Include email in context properly
      },
    };

    console.log(
      "Sending access request with data:",
      JSON.stringify(accessData, null, 2)
    );

    try {
      const response = await api.post<any>("/access/google-drive", accessData);
      return response.data;
    } catch (error: any) {
      console.error("Error requesting Google Drive access:", error);
      // Log more detailed error information
      if (error.response) {
        console.error("Response error data:", error.response.data);
      }
      throw error;
    }
  },

  /**
   * Check status of user's pending access requests
   */
  checkUserAccessRequests: async (folderId: string): Promise<any> => {
    try {
      const response = await api.get<any>(
        "/access/google-drive/check-requests",
        {
          params: { folder_id: folderId },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error checking access requests status:", error);
      return { has_request: false };
    }
  },

  /**
   * Get detailed information about a specific folder
   */
  getFolderDetails: async (folderId: string): Promise<any> => {
    try {
      const response = await api.get<any>(
        `/access/google-drive/folder/${folderId}`
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching folder details:", error);
      throw error;
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
  },

  /**
   * Get a summary of access requests
   */
  getAccessRequestsSummary: async (): Promise<any> => {
    try {
      const response = await api.get<any>("/access/google-drive/summary");
      return response.data;
    } catch (error) {
      console.error("Error fetching access requests summary:", error);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        recent_pending: [],
      };
    }
  },

  /**
   * Get Google Drive access requests with optional filtering
   * If no status is provided, returns all requests (empty string)
   */
  getDriveAccessRequests: async (status?: string): Promise<any[]> => {
    try {
      // If status is undefined or null, pass an empty object to get all statuses
      const params = status ? { status } : {};
      console.log("Requesting access requests with params:", params);
      const response = await api.get<any[]>("/access/google-drive/requests", {
        params,
      });
      console.log("API response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching Google Drive access requests:", error);
      throw error; // Re-throw to let the component handle it
    }
  },

  /**
   * Approve a Google Drive access request
   */
  approveDriveAccess: async (
    requestId: string,
    reason?: string
  ): Promise<any> => {
    try {
      console.log(
        `Approving request ${requestId}${
          reason ? ` with reason: ${reason}` : ""
        }`
      );

      const response = await api.post<any>(
        `/access/google-drive/requests/${requestId}/approve`,
        reason ? { reason } : {}
      );

      // Log response for debugging
      console.log("Approval response:", response.data);

      // Check for error in response
      if (response.data.drive_error) {
        console.warn(
          "Approval succeeded but drive access had error:",
          response.data.drive_error
        );
      }

      return response.data;
    } catch (error: any) {
      console.error("Error approving access request:", error);

      // Try to extract detailed error message
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to approve request";

      throw new Error(errorMessage);
    }
  },

  /**
   * Reject a Google Drive access request
   */
  rejectDriveAccess: async (
    requestId: string,
    reason?: string
  ): Promise<any> => {
    try {
      console.log(
        `Rejecting request ${requestId}${
          reason ? ` with reason: ${reason}` : ""
        }`
      );

      const response = await api.post<any>(
        `/access/google-drive/requests/${requestId}/reject`,
        reason ? { reason } : {}
      );

      // Log response for debugging
      console.log("Rejection response:", response.data);

      return response.data;
    } catch (error: any) {
      console.error("Error rejecting access request:", error);

      // Try to extract detailed error message
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to reject request";

      throw new Error(errorMessage);
    }
  },

  /**
   * Sync Google Drive share requests
   */
  syncGoogleDriveShareRequests: async (): Promise<any> => {
    try {
      const response = await api.get<any>(
        "/access/google-drive/sync-share-requests"
      );
      return response.data;
    } catch (error) {
      console.error("Error syncing Google Drive share requests:", error);
      throw error;
    }
  },

  /**
   * Sync Google Drive share requests from Gmail
   */
  syncGmailShareRequests: async (): Promise<any> => {
    try {
      const response = await api.post<any>(
        "/access/google-drive/sync-gmail-requests"
      );
      return response.data;
    } catch (error) {
      console.error("Error syncing Gmail share requests:", error);
      throw error;
    }
  },

  /**
   * Scan Google Drive folders and update placeholders
   */
  scanDriveFolders: async (): Promise<any> => {
    try {
      const response = await api.post<any>(
        "/access/google-drive/scan-drive-folders"
      );
      return response.data;
    } catch (error) {
      console.error("Error scanning Drive folders:", error);
      throw error;
    }
  },

  /**
   * Approve a Google Drive access request using the direct approval method
   * This uses the optimized backend method that works reliably
   */
  directApproveDriveAccess: async (
    requestId: string,
    reason?: string
  ): Promise<any> => {
    try {
      console.log(
        `Direct approving request ${requestId}${
          reason ? ` with reason: ${reason}` : ""
        }`
      );

      const response = await api.post<any>(
        `/access/google-drive/requests/${requestId}/direct-approve`,
        reason ? { reason } : {}
      );

      // Log response for debugging
      console.log("Direct approval response:", response.data);

      return response.data;
    } catch (error: any) {
      console.error("Error directly approving access request:", error);

      // Try to extract detailed error message
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to approve request";

      throw new Error(errorMessage);
    }
  },

  /**
   * Get all active permissions
   */
  getActivePermissions: async (): Promise<any[]> => {
    try {
      const response = await api.get<any[]>("/access/google-drive/permissions");
      return response.data;
    } catch (error) {
      console.error("Error fetching active permissions:", error);
      throw error;
    }
  },

  /**
   * Revoke a permission
   */
  revokePermission: async (permissionId: string): Promise<any> => {
    try {
      console.log(`Revoking permission with ID: ${permissionId}`);

      // Make API call to revoke the permission
      const response = await api.delete<any>(
        `/access/google-drive/permissions/${permissionId}`
      );

      // Log success response
      console.log("Permission successfully revoked:", response.data);

      return response.data;
    } catch (error: any) {
      // Enhanced error logging
      console.error("Error revoking permission:", error);

      if (error.response) {
        console.error("Error response status:", error.response.status);
        console.error("Error response data:", error.response.data);
      }

      // Throw a more detailed error message
      throw new Error(
        error.response?.data?.detail ||
          error.message ||
          "Failed to revoke permission"
      );
    }
  },
};

export default AccessApi;
