// src/pages/Devices/DeviceDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import MainLayout from "../../components/Layout/MainLayout";
import DevicesApi from "../../api/devices.api";
import VulnerabilitiesApi from "../../api/vulnerabilities.api";
import {
  Device,
  DeviceStatus,
  DeviceUpdate,
  Vulnerability,
  VulnerabilityCreate,
  VulnerabilitySeverity,
  VulnerabilityStatus,
} from "../../types";
import { useToast } from "../../store/ToastContext";

const DeviceDetailsPage: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [device, setDevice] = useState<Device | null>(null);
  const [riskInfo, setRiskInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [updateData, setUpdateData] = useState<DeviceUpdate>({});
  const [riskHistory, setRiskHistory] = useState<any[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [vulnerabilitiesLoading, setVulnerabilitiesLoading] =
    useState<boolean>(false);
  const [showVulnerabilityModal, setShowVulnerabilityModal] =
    useState<boolean>(false);
  const [newVulnerability, setNewVulnerability] = useState<VulnerabilityCreate>(
    {
      title: "",
      description: "",
      severity: VulnerabilitySeverity.MEDIUM,
      status: VulnerabilityStatus.OPEN,
    }
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const toggleMenu = (vulnerabilityId: string) => {
    if (openMenuId === vulnerabilityId) {
      // Если это меню уже открыто - закрываем его
      setOpenMenuId(null);
    } else {
      // Иначе закрываем предыдущее и открываем новое
      setOpenMenuId(vulnerabilityId);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Если меню открыто и клик был не по меню или его содержимому
      if (
        openMenuId !== null &&
        !(event.target as Element).closest(".vulnerability-menu")
      ) {
        setOpenMenuId(null);
      }
    };

    // Добавляем обработчик событий
    document.addEventListener("mousedown", handleClickOutside);

    // Удаляем обработчик при размонтировании компонента
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  useEffect(() => {
    const fetchDeviceDetails = async () => {
      if (!deviceId) return;

      setLoading(true);
      try {
        const deviceData = await DevicesApi.getDeviceById(deviceId);
        setDevice(deviceData);

        // Initialize form with current data
        setUpdateData({
          hostname: deviceData.hostname,
          os_type: deviceData.os_type,
          ip_address: deviceData.ip_address,
          is_trusted: deviceData.is_trusted,
        });

        // Get risk data
        const riskData = await DevicesApi.getDeviceRisk(deviceId);
        setRiskInfo(riskData);

        // Fetch risk history data
        const historyData = await DevicesApi.getDeviceRiskHistory(deviceId, 7);
        setRiskHistory(historyData);

        // Fetch vulnerabilities
        await fetchVulnerabilities();
      } catch (err: any) {
        console.error("Error fetching device details:", err);
        setError(err.message || "Failed to fetch device details");
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceDetails();
  }, [deviceId]);

  const fetchVulnerabilities = async () => {
    if (!deviceId) return;

    setVulnerabilitiesLoading(true);
    try {
      const vulnerabilityData =
        await VulnerabilitiesApi.getDeviceVulnerabilities(deviceId);
      setVulnerabilities(vulnerabilityData);
    } catch (err: any) {
      console.error("Error fetching vulnerabilities:", err);
      showToast(err.message || "Failed to fetch vulnerabilities", "error");
    } finally {
      setVulnerabilitiesLoading(false);
    }
  };

  // Обработчик изменения статуса устройства
  const handleStatusUpdate = async (newStatus: DeviceStatus) => {
    if (!deviceId || !device) return;

    setStatusUpdating(true);
    try {
      await DevicesApi.updateDeviceStatus(deviceId, newStatus);

      // Обновляем локальное состояние
      setDevice((prev) => (prev ? { ...prev, status: newStatus } : null));
      showToast(`Device status updated to ${newStatus}`, "success");
    } catch (err: any) {
      console.error("Error updating device status:", err);
      setError(err.message || "Failed to update device status");
      showToast(err.message || "Failed to update device status", "error");
    } finally {
      setStatusUpdating(false);
    }
  };

  // Обработчик изменения полей формы
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;

    setUpdateData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  // Обработчик изменения полей новой уязвимости
  const handleVulnerabilityInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    setNewVulnerability((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Обработчик сохранения изменений
  const handleSaveChanges = async () => {
    if (!deviceId || !device) return;

    try {
      const updatedDevice = await DevicesApi.updateDevice(deviceId, updateData);
      setDevice(updatedDevice);
      setEditMode(false);
      showToast("Device information updated successfully", "success");
    } catch (err: any) {
      console.error("Error updating device:", err);
      setError(err.message || "Failed to update device");
      showToast(err.message || "Failed to update device", "error");
    }
  };

  // Обработчик добавления новой уязвимости
  const handleAddVulnerability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId) return;

    try {
      const result = await VulnerabilitiesApi.createVulnerability(
        deviceId,
        newVulnerability
      );
      if (result) {
        setVulnerabilities([...vulnerabilities, result]);
        setShowVulnerabilityModal(false);
        setNewVulnerability({
          title: "",
          description: "",
          severity: VulnerabilitySeverity.MEDIUM,
          status: VulnerabilityStatus.OPEN,
        });
        showToast("Vulnerability added successfully", "success");

        // Refresh device risk score
        const riskData = await DevicesApi.getDeviceRisk(deviceId);
        setRiskInfo(riskData);

        // Refresh device data to get updated risk score
        const deviceData = await DevicesApi.getDeviceById(deviceId);
        setDevice(deviceData);
      }
    } catch (err: any) {
      console.error("Error adding vulnerability:", err);
      showToast(err.message || "Failed to add vulnerability", "error");
    }
  };

  // Обработчик обновления статуса уязвимости
  const handleUpdateVulnerabilityStatus = async (
    vulnerabilityId: string,
    newStatus: VulnerabilityStatus
  ) => {
    if (!deviceId) return;

    try {
      const result = await VulnerabilitiesApi.updateVulnerability(
        deviceId,
        vulnerabilityId,
        {
          status: newStatus,
        }
      );

      if (result) {
        // Обновляем массив уязвимостей
        setVulnerabilities(
          vulnerabilities.map((v) =>
            v.id === vulnerabilityId ? { ...v, status: newStatus } : v
          )
        );
        showToast(`Vulnerability status updated to ${newStatus}`, "success");

        // Refresh device risk score
        const riskData = await DevicesApi.getDeviceRisk(deviceId);
        setRiskInfo(riskData);

        // Refresh device data to get updated risk score
        const deviceData = await DevicesApi.getDeviceById(deviceId);
        setDevice(deviceData);
      }
    } catch (err: any) {
      console.error("Error updating vulnerability status:", err);
      showToast(
        err.message || "Failed to update vulnerability status",
        "error"
      );
    }
  };

  // Обработчик удаления уязвимости
  const handleDeleteVulnerability = async (vulnerabilityId: string) => {
    if (!deviceId) return;

    if (
      !window.confirm("Are you sure you want to delete this vulnerability?")
    ) {
      return;
    }

    try {
      const result = await VulnerabilitiesApi.deleteVulnerability(
        deviceId,
        vulnerabilityId
      );
      if (result) {
        // Удаляем уязвимость из массива
        setVulnerabilities(
          vulnerabilities.filter((v) => v.id !== vulnerabilityId)
        );
        showToast("Vulnerability deleted successfully", "success");

        // Refresh device risk score
        const riskData = await DevicesApi.getDeviceRisk(deviceId);
        setRiskInfo(riskData);

        // Refresh device data to get updated risk score
        const deviceData = await DevicesApi.getDeviceById(deviceId);
        setDevice(deviceData);
      }
    } catch (err: any) {
      console.error("Error deleting vulnerability:", err);
      showToast(err.message || "Failed to delete vulnerability", "error");
    }
  };

  // Функция для отображения цвета статуса
  const getStatusColor = (status: DeviceStatus) => {
    switch (status) {
      case DeviceStatus.ACTIVE:
        return "bg-green-100 text-green-800";
      case DeviceStatus.INACTIVE:
        return "bg-gray-100 text-gray-800";
      case DeviceStatus.QUARANTINED:
        return "bg-yellow-100 text-yellow-800";
      case DeviceStatus.BLOCKED:
        return "bg-red-100 text-red-800";
      case DeviceStatus.PENDING:
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Функция для отображения уровня риска
  const getRiskLevel = (score: number) => {
    if (score <= 30) return { text: "Low", color: "text-green-600" };
    if (score <= 70) return { text: "Medium", color: "text-yellow-600" };
    return { text: "High", color: "text-red-600" };
  };

  // Функция для получения цвета по уровню серьезности уязвимости
  const getSeverityColor = (severity: VulnerabilitySeverity) => {
    switch (severity) {
      case VulnerabilitySeverity.LOW:
        return "bg-green-100 text-green-800";
      case VulnerabilitySeverity.MEDIUM:
        return "bg-yellow-100 text-yellow-800";
      case VulnerabilitySeverity.HIGH:
        return "bg-red-100 text-red-800";
      case VulnerabilitySeverity.CRITICAL:
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Функция для получения цвета по статусу уязвимости
  const getVulnerabilityStatusColor = (status: VulnerabilityStatus) => {
    switch (status) {
      case VulnerabilityStatus.OPEN:
        return "bg-red-100 text-red-800";
      case VulnerabilityStatus.IN_PROGRESS:
        return "bg-blue-100 text-blue-800";
      case VulnerabilityStatus.RESOLVED:
        return "bg-green-100 text-green-800";
      case VulnerabilityStatus.ACCEPTED:
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </MainLayout>
    );
  }

  if (error || !device) {
    return (
      <MainLayout>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error || "Device not found"}</span>
          <button
            className="mt-3 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
            onClick={() => navigate("/devices")}
          >
            Back to Devices
          </button>
        </div>
      </MainLayout>
    );
  }

  const riskLevelInfo = getRiskLevel(device.risk_score);

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {device.hostname}
          </h1>
          <p className="text-gray-600">Device ID: {device.device_id}</p>
        </div>
        <div className="flex space-x-2">
          <button
            className={`px-4 py-2 rounded-md ${
              editMode
                ? "bg-gray-500 hover:bg-gray-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? "Cancel" : "Edit Device"}
          </button>
          {editMode && (
            <button
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
              onClick={handleSaveChanges}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Основная информация */}
        <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Device Information</h2>

          {editMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="hostname"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Hostname
                </label>
                <input
                  id="hostname"
                  type="text"
                  name="hostname"
                  value={updateData.hostname || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter device hostname"
                  aria-label="Device hostname"
                />
              </div>
              <div>
                <label
                  htmlFor="ip_address"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  IP Address
                </label>
                <input
                  id="ip_address"
                  type="text"
                  name="ip_address"
                  value={updateData.ip_address || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter IP address"
                  aria-label="Device IP address"
                />
              </div>
              <div>
                <label
                  htmlFor="os_type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  OS Type
                </label>
                <input
                  id="os_type"
                  type="text"
                  name="os_type"
                  value={updateData.os_type || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter operating system type"
                  aria-label="Device operating system"
                />
              </div>
              <div className="flex items-center">
                <input
                  id="is_trusted"
                  type="checkbox"
                  name="is_trusted"
                  checked={updateData.is_trusted || false}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  aria-label="Mark device as trusted"
                />
                <label
                  htmlFor="is_trusted"
                  className="ml-2 block text-sm text-gray-900"
                >
                  Trusted Device
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Device Type</p>
                <p className="font-medium">{device.device_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">OS</p>
                <p className="font-medium">{device.os_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">IP Address</p>
                <p className="font-medium">{device.ip_address}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">MAC Address</p>
                <p className="font-medium">{device.mac_address}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Registration Date</p>
                <p className="font-medium">
                  {new Date(device.registered_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Seen</p>
                <p className="font-medium">
                  {new Date(device.last_seen).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      device.status
                    )}`}
                  >
                    {device.status}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Trust Status</p>
                <p className="font-medium">
                  {device.is_trusted ? (
                    <span className="text-green-600">Trusted</span>
                  ) : (
                    <span className="text-red-600">Untrusted</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {!editMode && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">System Information</h3>
              <div className="bg-gray-50 p-3 rounded-md">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(device.system_info, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Информация о риске */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Risk Assessment</h2>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Risk Score
              </span>
              <span className={`text-lg font-bold ${riskLevelInfo.color}`}>
                {device.risk_score}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${
                  device.risk_score <= 30
                    ? "bg-green-600"
                    : device.risk_score <= 70
                    ? "bg-yellow-500"
                    : "bg-red-600"
                }`}
                style={{ width: `${device.risk_score}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">
              Risk Level
            </h3>
            <p className={`font-bold ${riskLevelInfo.color}`}>
              {riskLevelInfo.text}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {riskLevelInfo.text === "Low"
                ? "This device poses minimal risk to your network."
                : riskLevelInfo.text === "Medium"
                ? "This device requires monitoring for security issues."
                : "This device poses significant risk and requires immediate attention."}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`px-3 py-1.5 rounded ${
                  device.status === DeviceStatus.ACTIVE
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-green-100 hover:bg-green-200 text-green-800"
                }`}
                disabled={
                  statusUpdating || device.status === DeviceStatus.ACTIVE
                }
                onClick={() => handleStatusUpdate(DeviceStatus.ACTIVE)}
              >
                Activate
              </button>
              <button
                className={`px-3 py-1.5 rounded ${
                  device.status === DeviceStatus.QUARANTINED
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
                }`}
                disabled={
                  statusUpdating || device.status === DeviceStatus.QUARANTINED
                }
                onClick={() => handleStatusUpdate(DeviceStatus.QUARANTINED)}
              >
                Quarantine
              </button>
              <button
                className={`px-3 py-1.5 rounded ${
                  device.status === DeviceStatus.BLOCKED
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-red-100 hover:bg-red-200 text-red-800"
                }`}
                disabled={
                  statusUpdating || device.status === DeviceStatus.BLOCKED
                }
                onClick={() => handleStatusUpdate(DeviceStatus.BLOCKED)}
              >
                Block
              </button>
              <button
                className={`px-3 py-1.5 rounded ${
                  device.status === DeviceStatus.INACTIVE
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
                disabled={
                  statusUpdating || device.status === DeviceStatus.INACTIVE
                }
                onClick={() => handleStatusUpdate(DeviceStatus.INACTIVE)}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* График изменения риска со временем */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Risk History</h2>
        <div style={{ width: "100%", height: 300 }}>
          {riskHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={riskHistory}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string | number) =>
                    new Date(value).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  labelFormatter={(value: string | number) =>
                    `Date: ${new Date(value).toLocaleDateString()}`
                  }
                  formatter={(value: string | number) => [
                    `Risk Score: ${value}`,
                    "Risk",
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="risk"
                  stroke="#3B82F6"
                  activeDot={{ r: 8 }}
                  name="Risk Score"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p className="mt-2 text-gray-500">
                  No risk history data available
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Уязвимости устройства */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Vulnerabilities</h2>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
            onClick={() => setShowVulnerabilityModal(true)}
          >
            Add Vulnerability
          </button>
        </div>

        {vulnerabilitiesLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">
              Loading vulnerabilities...
            </span>
          </div>
        ) : vulnerabilities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Severity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Description
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vulnerabilities.map((vuln) => (
                  <tr key={vuln.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{vuln.title}</div>
                        {vuln.cve_id && (
                          <div className="text-xs text-gray-500">
                            {vuln.cve_id}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(
                          vuln.severity
                        )}`}
                      >
                        {vuln.severity}
                      </span>
                      {vuln.cvss_score && (
                        <div className="mt-1 text-xs text-gray-500">
                          CVSS: {vuln.cvss_score}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div
                        className="max-w-md truncate"
                        title={vuln.description}
                      >
                        {vuln.description}
                      </div>
                      {vuln.affected_component && (
                        <div className="text-xs text-gray-500 mt-1">
                          Component: {vuln.affected_component}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getVulnerabilityStatusColor(
                          vuln.status
                        )}`}
                      >
                        {vuln.status}
                      </span>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(vuln.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2 vulnerability-menu">
                        <div className="relative">
                          <button
                            className="text-gray-600 hover:text-blue-600"
                            aria-label="Actions menu"
                            title="Vulnerability actions"
                            onClick={() => toggleMenu(vuln.id)}
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M4 6h16M4 12h16M4 18h16"
                              />
                            </svg>
                          </button>
                          {openMenuId === vuln.id && (
                            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-md border border-gray-100">
                              <div className="py-1">
                                {vuln.status !==
                                  VulnerabilityStatus.IN_PROGRESS && (
                                  <button
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    onClick={() => {
                                      handleUpdateVulnerabilityStatus(
                                        vuln.id,
                                        VulnerabilityStatus.IN_PROGRESS
                                      );
                                      setOpenMenuId(null); // Закрываем меню после выбора действия
                                    }}
                                    aria-label="Mark vulnerability as in progress"
                                  >
                                    Mark In Progress
                                  </button>
                                )}
                                {vuln.status !==
                                  VulnerabilityStatus.RESOLVED && (
                                  <button
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    onClick={() => {
                                      handleUpdateVulnerabilityStatus(
                                        vuln.id,
                                        VulnerabilityStatus.RESOLVED
                                      );
                                      setOpenMenuId(null); // Закрываем меню после выбора действия
                                    }}
                                    aria-label="Mark vulnerability as resolved"
                                  >
                                    Mark Resolved
                                  </button>
                                )}
                                {vuln.status !==
                                  VulnerabilityStatus.ACCEPTED && (
                                  <button
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    onClick={() => {
                                      handleUpdateVulnerabilityStatus(
                                        vuln.id,
                                        VulnerabilityStatus.ACCEPTED
                                      );
                                      setOpenMenuId(null); // Закрываем меню после выбора действия
                                    }}
                                    aria-label="Accept vulnerability risk"
                                  >
                                    Accept Risk
                                  </button>
                                )}
                                <button
                                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                  onClick={() => {
                                    handleDeleteVulnerability(vuln.id);
                                    setOpenMenuId(null); // Закрываем меню после выбора действия
                                  }}
                                  aria-label="Delete vulnerability"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No vulnerabilities detected
          </div>
        )}
      </div>

      {/* Modal for adding a new vulnerability */}
      {showVulnerabilityModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-black opacity-30"
              onClick={() => setShowVulnerabilityModal(false)}
            ></div>
            <div className="bg-white rounded-lg shadow-xl z-50 w-full max-w-md p-6 relative">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-medium">Add New Vulnerability</h3>
                <button
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => setShowVulnerabilityModal(false)}
                  aria-label="Close modal"
                  title="Close"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleAddVulnerability}>
                <div className="mb-4">
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={newVulnerability.title}
                    onChange={handleVulnerabilityInputChange}
                  />
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={newVulnerability.description}
                    onChange={handleVulnerabilityInputChange}
                  ></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label
                      htmlFor="severity"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Severity *
                    </label>
                    <select
                      id="severity"
                      name="severity"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={newVulnerability.severity}
                      onChange={handleVulnerabilityInputChange}
                    >
                      <option value={VulnerabilitySeverity.LOW}>Low</option>
                      <option value={VulnerabilitySeverity.MEDIUM}>
                        Medium
                      </option>
                      <option value={VulnerabilitySeverity.HIGH}>High</option>
                      <option value={VulnerabilitySeverity.CRITICAL}>
                        Critical
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="status"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Status *
                    </label>
                    <select
                      id="status"
                      name="status"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={newVulnerability.status}
                      onChange={handleVulnerabilityInputChange}
                    >
                      <option value={VulnerabilityStatus.OPEN}>Open</option>
                      <option value={VulnerabilityStatus.IN_PROGRESS}>
                        In Progress
                      </option>
                      <option value={VulnerabilityStatus.RESOLVED}>
                        Resolved
                      </option>
                      <option value={VulnerabilityStatus.ACCEPTED}>
                        Accepted
                      </option>
                    </select>
                  </div>
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="cve_id"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    CVE ID (optional)
                  </label>
                  <input
                    type="text"
                    id="cve_id"
                    name="cve_id"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={newVulnerability.cve_id || ""}
                    onChange={handleVulnerabilityInputChange}
                    placeholder="e.g. CVE-2022-12345"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label
                      htmlFor="cvss_score"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      CVSS Score (optional)
                    </label>
                    <input
                      type="number"
                      id="cvss_score"
                      name="cvss_score"
                      min="0"
                      max="10"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={newVulnerability.cvss_score || ""}
                      onChange={handleVulnerabilityInputChange}
                      placeholder="0.0 - 10.0"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="affected_component"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Affected Component (optional)
                    </label>
                    <input
                      type="text"
                      id="affected_component"
                      name="affected_component"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={newVulnerability.affected_component || ""}
                      onChange={handleVulnerabilityInputChange}
                      placeholder="e.g. OS, Network, Application"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="remediation_steps"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Remediation Steps (optional)
                  </label>
                  <textarea
                    id="remediation_steps"
                    name="remediation_steps"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={newVulnerability.remediation_steps || ""}
                    onChange={handleVulnerabilityInputChange}
                    placeholder="Describe how to resolve this vulnerability"
                  ></textarea>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowVulnerabilityModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add Vulnerability
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default DeviceDetailsPage;
