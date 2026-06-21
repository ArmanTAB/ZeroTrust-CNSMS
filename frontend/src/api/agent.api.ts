// frontend/src/api/agent.api.ts
import api from "./api";
import {
  AgentUser,
  AgentUserRole,
  AgentRule,
  AgentRuleType,
  AgentActivity,
} from "../types/agent";

const AgentApi = {
  /**
   * Get users from the agent system
   */
  getUsers: async (params: any = {}): Promise<AgentUser[]> => {
    try {
      const response = await api.get<AgentUser[]>("/api/agent/users/", {
        params,
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching agent users:", error);
      return [];
    }
  },

  /**
   * Get a specific user by ID
   */
  getUserById: async (userId: string): Promise<AgentUser | null> => {
    try {
      const response = await api.get<AgentUser>(`/api/agent/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching agent user ${userId}:`, error);
      return null;
    }
  },

  /**
   * Create a new agent user
   */
  createUser: async (
    userData: Partial<AgentUser>
  ): Promise<AgentUser | null> => {
    try {
      const response = await api.post<AgentUser>("/api/agent/users/", userData);
      return response.data;
    } catch (error) {
      console.error("Error creating agent user:", error);
      throw error;
    }
  },

  /**
   * Update an existing agent user
   */
  updateUser: async (
    userId: string,
    userData: Partial<AgentUser>
  ): Promise<AgentUser | null> => {
    try {
      const response = await api.put<AgentUser>(
        `/api/agent/users/${userId}`,
        userData
      );
      return response.data;
    } catch (error) {
      console.error(`Error updating agent user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Delete an agent user
   */
  deleteUser: async (userId: string): Promise<boolean> => {
    try {
      await api.delete(`/api/agent/users/${userId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting agent user ${userId}:`, error);
      return false;
    }
  },

  /**
   * Update user status (active/inactive)
   */
  updateUserStatus: async (
    userId: string,
    isActive: boolean
  ): Promise<boolean> => {
    try {
      // Make sure to send the isActive field in an object
      await api.patch(`/api/agent/users/${userId}/status`, { isActive });
      return true;
    } catch (error) {
      console.error(`Error updating agent user status ${userId}:`, error);
      return false;
    }
  },

  /**
   * Get access rules from the agent system
   */
  getRules: async (params: any = {}): Promise<AgentRule[]> => {
    try {
      const response = await api.get<AgentRule[]>("/api/agent/rules/", {
        params,
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching agent rules:", error);
      return [];
    }
  },

  /**
   * Get a specific rule by ID
   */
  getRuleById: async (ruleId: string): Promise<AgentRule | null> => {
    try {
      const response = await api.get<AgentRule>(`/api/agent/rules/${ruleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching agent rule ${ruleId}:`, error);
      return null;
    }
  },

  /**
   * Create a new access rule
   */
  createRule: async (
    ruleData: Partial<AgentRule>
  ): Promise<AgentRule | null> => {
    try {
      const response = await api.post<AgentRule>("/api/agent/rules/", ruleData);
      return response.data;
    } catch (error) {
      console.error("Error creating agent rule:", error);
      throw error;
    }
  },

  /**
   * Update an existing access rule
   */
  updateRule: async (
    ruleId: string,
    ruleData: Partial<AgentRule>
  ): Promise<AgentRule | null> => {
    try {
      const response = await api.put<AgentRule>(
        `/api/agent/rules/${ruleId}`,
        ruleData
      );
      return response.data;
    } catch (error) {
      console.error(`Error updating agent rule ${ruleId}:`, error);
      throw error;
    }
  },

  /**
   * Delete an access rule
   */
  deleteRule: async (ruleId: string): Promise<boolean> => {
    try {
      await api.delete(`/api/agent/rules/${ruleId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting agent rule ${ruleId}:`, error);
      return false;
    }
  },

  /**
   * Get agent activities (logs)
   */
  getActivities: async (params: any = {}): Promise<AgentActivity[]> => {
    try {
      console.log("Requesting agent activities with params:", params); // Debug log

      const response = await api.get<AgentActivity[]>(
        "/api/agent/activities/",
        {
          params: {
            skip: params.skip || 0,
            limit: params.limit || 50,
            user_id: params.user_id,
            device_id: params.device_id,
            blocked: params.blocked,
            type: params.type,
          },
        }
      );

      console.log("Agent activities API response:", response.data); // Debug log
      return response.data;
    } catch (error) {
      console.error("Error fetching agent activities:", error);
      return [];
    }
  },

  /**
   * Get agent statistics for dashboard
   */
  getStatistics: async (): Promise<any> => {
    try {
      const response = await api.get<any>("/api/agent/statistics");
      return response.data;
    } catch (error) {
      console.error("Error fetching agent statistics:", error);
      return {
        users: {
          total: 0,
          active: 0,
          inactive: 0,
        },
        rules: {
          total: 0,
          allow: 0,
          block: 0,
          active: 0,
          inactive: 0,
        },
        activities: {
          total: 0,
          allowed: 0,
          blocked: 0,
        },
      };
    }
  },
};

export default AgentApi;
