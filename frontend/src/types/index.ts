// src/types/index.ts

// Типы для авторизации
export enum UserRole {
  ADMIN = "admin",
  SECURITY_ANALYST = "security_analyst",
  NETWORK_ADMIN = "network_admin",
  VIEWER = "viewer",
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  last_login?: string;
  is_active: boolean;
  is_verified: boolean; // Added verification status
}

export interface LoginCredentials {
  username: string; // email
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface VerificationRequest {
  email: string;
  code: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface VerificationStatus {
  is_verified: boolean;
  email: string;
}

// Типы для устройств
export enum DeviceType {
  WORKSTATION = "workstation",
  LAPTOP = "laptop",
  SERVER = "server",
  MOBILE = "mobile",
  IOT = "iot",
  NETWORK = "network",
  BYOD = "byod",
}

export enum DeviceStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  QUARANTINED = "quarantined",
  BLOCKED = "blocked",
  PENDING = "pending",
}

export interface Device {
  id: string;
  device_id: string;
  device_type: DeviceType;
  ip_address: string;
  mac_address: string;
  os_type: string;
  hostname: string;
  is_trusted: boolean;
  system_info: Record<string, any>;
  registered_at: string;
  last_seen: string;
  risk_score: number;
  status: DeviceStatus;
  vulnerabilities: Array<Record<string, any>>;
  compliance_status: Record<string, boolean>;
}

export interface DeviceCreate {
  device_id: string;
  device_type: DeviceType;
  ip_address: string;
  mac_address: string;
  os_type: string;
  hostname: string;
  is_trusted: boolean;
  system_info: Record<string, any>;
}

export interface DeviceUpdate {
  ip_address?: string;
  os_type?: string;
  hostname?: string;
  is_trusted?: boolean;
  system_info?: Record<string, any>;
  status?: DeviceStatus;
}

// Типы для доступа
export enum AccessType {
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
  ADMIN = "admin",
  EXECUTE = "execute",
}

export interface AccessLog {
  id: string;
  device_id: string;
  user_id?: string;
  ip_address: string;
  user_agent: string;
  resource: string;
  timestamp: string;
  access_type: AccessType;
  context: Record<string, any>;
  access_granted: boolean;
  reason?: string;
  risk_level: number;
  decision_factors: Array<Record<string, any>>;
}

export interface AccessLogCreate {
  device_id: string;
  user_id?: string;
  ip_address: string;
  user_agent: string;
  resource: string;
  timestamp?: string;
  access_type: AccessType;
  context?: Record<string, any>;
}

export interface AccessDecision {
  access_granted: boolean;
  reason?: string;
  risk_level: number;
  context: Record<string, any>;
}

export interface AccessStatistics {
  total: number;
  allowed: number;
  denied: number;
  time_range: {
    start: string;
    end: string;
  };
}
