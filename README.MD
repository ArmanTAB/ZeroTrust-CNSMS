# Zero Trust Security Management System

A comprehensive security management platform built on Zero Trust principles for monitoring devices, tracking access attempts, and managing security across an enterprise network.

## Overview

This system provides a complete solution for implementing and managing Zero Trust security architecture, with features for device management, access control, vulnerability tracking, and comprehensive security monitoring.

## Features

- User authentication with email verification and two-factor authentication (TOTP)
- Device inventory management and monitoring
- Real-time risk assessment for network devices
- Access request management with Zero Trust principles
- Security alerts and monitoring dashboard
- Vulnerability management for tracked devices

## Technology Stack

### Backend

- **Framework**: FastAPI (Python)
- **Database**: MongoDB with Motor for async operations
- **Authentication**: JWT tokens, TOTP for 2FA

### Frontend

- **Framework**: React with TypeScript
- **UI**: Tailwind CSS
- **State Management**: React Context API
- **Routing**: React Router v6
- **Charts/Visualization**: Recharts

## Backend API Structure

### Authentication API (`/auth`)

- **POST** `/auth/register` - Register a new user
- **POST** `/auth/token` - Login and obtain access token
- **GET** `/auth/me` - Get current user profile
- **POST** `/auth/verify-email` - Verify email with verification code
- **POST** `/auth/resend-verification` - Resend email verification code
- **GET** `/auth/verification-status/{email}` - Check email verification status
- **POST** `/auth/request-password-reset` - Request password reset code
- **POST** `/auth/reset-password` - Reset password with code

#### Two-Factor Authentication

- **POST** `/auth/totp/setup` - Generate TOTP setup (QR code)
- **POST** `/auth/totp/verify` - Verify TOTP code to enable 2FA
- **POST** `/auth/totp/disable` - Disable 2FA
- **GET** `/auth/totp/status` - Check 2FA status
- **POST** `/auth/login/2fa-check` - Check if 2FA is required for login

### Devices API (`/devices`)

- **GET** `/devices/scan-network` - Scan network for devices
- **POST** `/devices/register` - Register a new device
- **GET** `/devices/` - Get all devices with filtering
- **GET** `/devices/statistics` - Get device statistics for dashboard
- **GET** `/devices/{device_id}` - Get specific device details
- **PUT** `/devices/{device_id}` - Update device information
- **PUT** `/devices/{device_id}/status` - Update device status
- **GET** `/devices/{device_id}/risk` - Get device risk assessment
- **GET** `/devices/{device_id}/risk-history` - Get historical risk data

#### Vulnerabilities API (`/devices/{device_id}/vulnerabilities`)

- **POST** `/` - Add a vulnerability to a device
- **GET** `/` - Get all vulnerabilities for a device
- **GET** `/{vulnerability_id}` - Get specific vulnerability details
- **PUT** `/{vulnerability_id}` - Update vulnerability information
- **DELETE** `/{vulnerability_id}` - Delete a vulnerability

### Access API (`/access`)

- **POST** `/access/request` - Request access to a resource
- **POST** `/access/log` - Log an access attempt
- **GET** `/access/logs` - Get access logs with filtering
- **GET** `/access/statistics` - Get access statistics
- **GET** `/access/activity` - Get access activity by day
- **GET** `/access/alerts` - Get security alerts

## Frontend Components

### Authentication Components

- **LoginPage** - User login with optional 2FA
- **RegisterPage** - User registration with stepwise flow
- **VerifyEmailPage** - Email verification with code input
- **ForgotPasswordPage** - Password reset request
- **ResetPasswordPage** - Password reset with verification code
- **TOTPVerification** - 2FA code verification component

### Core Application Pages

- **DashboardPage** - Main dashboard with security overview
- **DevicesPage** - Device inventory and management
- **DeviceDetailsPage** - Detailed device information and risk assessment
- **AccessLogsPage** - Access logs with detailed filtering
- **ProfilePage** - User profile with 2FA management

### Utility Components

- **MainLayout** - Main application layout with navigation
- **ProtectedRoute** - Route protection for authenticated users
- **NetworkScanModal** - Network scanning interface
- **Toast** - Notification component

## Database Schema

### Users Collection

- Authentication details
- User profile information
- Email verification status
- TOTP 2FA configuration

### Devices Collection

- Device identification and network details
- Security status and trust level
- Risk assessment metrics
- System information

### Vulnerabilities Collection

- Device-specific vulnerabilities
- Severity and status tracking
- Remediation information
- CVE and CVSS scoring

### Access Logs Collection

- Access attempt records
- Decision factors for Zero Trust evaluation
- Risk level assessments
- Context information

### Security Alerts Collection

- Security incident records
- Severity classification
- Source tracking
- Resolution status

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 14+
- MongoDB

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   ```
   create .env file in backend folder
   ```
   Edit `.env` with your MongoDB URI and other settings.

4. Run the server:
   ```
   python run.py
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

## License

[MIT License](LICENSE)