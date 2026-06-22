# ZeroTrust-CNSMS

A centralized network security management system built around Zero Trust principles. The platform consists of three components: a REST API backend, a web-based management dashboard, and a lightweight endpoint agent deployed on monitored machines.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Management Dashboard                  │
│              React + TypeScript + Material UI            │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP / REST
┌─────────────────────────▼────────────────────────────────┐
│                      FastAPI Backend                      │
│         Auth · Devices · Access · Vulnerabilities        │
│              Google Drive · Agent API                    │
└──────┬───────────────────────────────┬───────────────────┘
       │ MongoDB (Motor async)         │ Agent API
       │                    ┌──────────▼──────────────────┐
       │                    │      Endpoint Agent          │
       │                    │  Electron · Node.js          │
       │                    │  Network/Process Monitoring  │
       └────────────────────└─────────────────────────────┘
```

**Backend** — `FastAPI` with async MongoDB driver (`motor`). Handles authentication, device registry, access evaluation, and serves the agent API.

**Frontend** — `React 18` + `TypeScript`, `Material UI`, `Recharts` for visualization. Single-page app for security operations and device management.

**Agent** — Cross-platform `Electron` desktop application. Runs on endpoints, enforces network-level blocking rules (via OS hosts file manipulation), monitors running processes, and synchronizes policy from the backend.

---

## Features

**Authentication**
- JWT-based session management
- Email verification with OTP codes
- TOTP two-factor authentication (RFC 6238 compatible, QR code setup)
- Password reset flow via email

**Device Management**
- Network scanning via `nmap` and `scapy`
- Device registration with automatic trust level assignment
- Continuous risk scoring based on device state, vulnerabilities, and behavior
- Risk score history tracking

**Zero Trust Access Evaluation**
- Default-deny policy — every access request is evaluated, never implicit
- Risk-based access decisions: device risk score vs. resource sensitivity threshold
- Access log retention for audit purposes
- Security alert generation on suspicious activity

**Vulnerability Management**
- Per-device vulnerability tracking with severity and status
- CVE identifier and CVSS score fields
- Remediation notes and status workflow (open → in progress → resolved)

**Google Drive Integration**
- OAuth2 integration with Google Drive
- Folder-level sensitivity classification
- Access requests evaluated against Zero Trust policy before file access

**Endpoint Agent**
- Pulls enforcement rules from the backend on a configurable sync interval
- Blocks domains and subnets via OS-level hosts file modification
- Monitors running processes against a blocklist
- MFA-gated login for agent authentication
- Packaged as a native installer for Windows, macOS, and Linux

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.8+, FastAPI, Motor (async MongoDB) |
| Auth | python-jose (JWT), pyotp (TOTP), bcrypt, python-nmap, scapy |
| Frontend | React 18, TypeScript, Material UI, Recharts, React Router v6 |
| Agent | Electron 28, Node.js, Winston (logging), electron-store |
| Database | MongoDB |
| Email | Gmail API (OAuth2), SMTP fallback |

---

## Project Structure

```
ZeroTrust-CNSMS/
├── backend/
│   ├── app/
│   │   ├── auth/           # JWT, TOTP, email OTP, password reset
│   │   ├── devices/        # Device registry, risk scoring, vulnerabilities
│   │   ├── access/         # Zero Trust evaluation engine, access logs, alerts
│   │   ├── agent/          # Agent registration and sync API
│   │   ├── integrations/   # Gmail OAuth, Google Drive
│   │   ├── common/         # Alert generation, email utilities
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/          # Dashboard, Devices, Access Logs, Profile
│   │   └── components/     # Layout, Auth forms, Charts
│   └── package.json
└── agent/
    ├── src/
    │   ├── main/           # Electron main process, settings
    │   └── modules/        # networkMonitor, processMonitor, ruleSync, auth
    └── package.json
```

---

## API Reference

### Auth — `/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/token` | Obtain JWT access token |
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/verify-email` | Verify email address |
| POST | `/auth/request-password-reset` | Request password reset |
| POST | `/auth/reset-password` | Reset password with OTP |
| POST | `/auth/totp/setup` | Generate TOTP secret and QR code |
| POST | `/auth/totp/verify` | Confirm and enable TOTP |
| POST | `/auth/totp/disable` | Disable TOTP |

### Devices — `/devices`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/devices/scan-network` | Scan local network for devices |
| POST | `/devices/register` | Register a device |
| GET | `/devices/` | List devices with filters |
| GET | `/devices/statistics` | Aggregate stats for dashboard |
| GET | `/devices/{id}/risk` | Current risk score |
| GET | `/devices/{id}/risk-history` | Historical risk data |
| POST | `/devices/{id}/vulnerabilities/` | Add vulnerability |
| GET | `/devices/{id}/vulnerabilities/` | List vulnerabilities |
| PUT | `/devices/{id}/vulnerabilities/{vid}` | Update vulnerability |

### Access — `/access`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/access/request` | Evaluate an access request |
| POST | `/access/log` | Log an access attempt |
| GET | `/access/logs` | Retrieve logs with filtering |
| GET | `/access/statistics` | Access statistics |
| GET | `/access/alerts` | Security alerts |

---

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 18+
- MongoDB instance (local or Atlas)
- Gmail API credentials (optional, for email features)

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=zerotrust
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=60
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
```

```bash
python run.py
```

API available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm start
```

App available at `http://localhost:3000`.

### Agent

```bash
cd agent
npm install
npm start          # development
npm run build:win  # build Windows installer
npm run build:mac  # build macOS DMG
npm run build:linux # build AppImage
```

The agent requires administrator/root privileges to modify the hosts file for network enforcement.

---

## Access Evaluation Logic

Every access request goes through the evaluation engine in `backend/app/access/utils.py`:

1. Device must be registered — unknown devices are denied.
2. Device must not be in `blocked` or `quarantined` state.
3. Device risk score is calculated dynamically (vulnerability count, severity, last seen, trust level).
4. Resource sensitivity is determined (public / internal / confidential / restricted).
5. If `device_risk_score <= max_allowed_risk_for_sensitivity` → access granted.
6. Otherwise → denied with reason logged.

Default policy is deny-all. Access is only granted when all conditions are met explicitly.

---

## License

MIT