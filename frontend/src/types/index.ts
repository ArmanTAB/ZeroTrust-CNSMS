export enum UserRole {
  ADMIN = "admin",
  SECURITY_ANALYST = "security_analyst",
  NETWORK_ADMIN = "network_admin",
}

// Типы для авторизации
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

// Password Reset interfaces
export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetVerifyRequest {
  email: string;
  code: string;
  new_password: string;
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

export enum VulnerabilitySeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum VulnerabilityStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  ACCEPTED = "accepted",
}

export interface Vulnerability {
  id: string;
  device_id: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status: VulnerabilityStatus;
  created_at: string;
  updated_at?: string;
}

export interface VulnerabilityCreate {
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status: VulnerabilityStatus;
}

export interface VulnerabilityUpdate {
  title?: string;
  description?: string;
  severity?: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status?: VulnerabilityStatus;
}

export interface TOTPSetupResponse {
  status: string;
  message: string;
  data: {
    secret: string;
    qr_code: string;
    issuer: string;
    account: string;
  };
}

export interface TOTPStatusResponse {
  totp_enabled: boolean;
}

export interface EmailOTPStatusResponse {
  email_otp_enabled: boolean;
}

export interface EmailOTPSetupResponse {
  status: string;
  message: string;
}

export interface EmailOTPVerifyResponse {
  status: string;
  message: string;
  email_otp_enabled: boolean;
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

// Password Reset interfaces
export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetVerifyRequest {
  email: string;
  code: string;
  new_password: string;
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

export interface Vulnerability {
  id: string;
  device_id: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status: VulnerabilityStatus;
  created_at: string;
  updated_at?: string;
}

export interface VulnerabilityCreate {
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status: VulnerabilityStatus;
}

export interface VulnerabilityUpdate {
  title?: string;
  description?: string;
  severity?: VulnerabilitySeverity;
  cve_id?: string;
  cvss_score?: number;
  affected_component?: string;
  remediation_steps?: string;
  status?: VulnerabilityStatus;
}

export interface TOTPSetupResponse {
  status: string;
  message: string;
  data: {
    secret: string;
    qr_code: string;
    issuer: string;
    account: string;
  };
}

export interface TOTPStatusResponse {
  totp_enabled: boolean;
}

export interface EmailOTPStatusResponse {
  email_otp_enabled: boolean;
}

export interface EmailOTPSetupResponse {
  status: string;
  message: string;
}

export interface EmailOTPVerifyResponse {
  status: string;
  message: string;
  email_otp_enabled: boolean;
}