// frontend/src/types/agent.ts
export enum AgentUserRole {
  ADMIN = "admin",
  MANAGER = "manager",
  USER = "user",
}

export interface AgentUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string; // Only used when creating/updating
  role: AgentUserRole;
  department: string;
  position: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export enum AgentRuleType {
  BLOCK = "block",
  ALLOW = "allow",
}

export interface AgentRule {
  _id: string;
  name: string;
  description: string;
  type: AgentRuleType;
  resources: {
    websites: string[];
    applications: string[];
    files: string[];
  };
  appliesTo: {
    users: string[];
    departments: string[];
    roles: string[];
  };
  conditions: {
    timeRestrictions: {
      enabled: boolean;
      startTime: string;
      endTime: string;
      days: number[]; // 0-6 (Sunday-Saturday)
    };
  };
  priority: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export enum AgentActivityType {
  NETWORK = "network",
  PROCESS = "process",
  FILE = "file",
}

export interface AgentActivity {
  id: string;
  timestamp: string;
  type: AgentActivityType;
  resource: string;
  blocked: boolean;
  ruleName?: string;
  description: string;
  deviceId?: string;
  userId?: string;
}

export interface AgentStatistics {
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  rules: {
    total: number;
    allow: number;
    block: number;
    active: number;
    inactive: number;
  };
  activities: {
    total: number;
    allowed: number;
    blocked: number;
  };
}
