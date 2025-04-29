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
import { Device, DeviceStatus, DeviceUpdate } from "../../types";

const DeviceDetailsPage: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);
  const [riskInfo, setRiskInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [updateData, setUpdateData] = useState<DeviceUpdate>({});
  const [riskHistory, setRiskHistory] = useState<any[]>([]);

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
      } catch (err: any) {
        console.error("Error fetching device details:", err);
        setError(err.message || "Failed to fetch device details");
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceDetails();
  }, [deviceId]);

  // Обработчик изменения статуса устройства
  const handleStatusUpdate = async (newStatus: DeviceStatus) => {
    if (!deviceId || !device) return;

    setStatusUpdating(true);
    try {
      await DevicesApi.updateDeviceStatus(deviceId, newStatus);

      // Обновляем локальное состояние
      setDevice((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (err: any) {
      console.error("Error updating device status:", err);
      setError(err.message || "Failed to update device status");
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

  // Обработчик сохранения изменений
  const handleSaveChanges = async () => {
    if (!deviceId || !device) return;

    try {
      const updatedDevice = await DevicesApi.updateDevice(deviceId, updateData);
      setDevice(updatedDevice);
      setEditMode(false);
    } catch (err: any) {
      console.error("Error updating device:", err);
      setError(err.message || "Failed to update device");
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
                  formatter={(value: string | number) => [`Risk Score: ${value}`, "Risk"]}
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
        <h2 className="text-xl font-semibold mb-4">Vulnerabilities</h2>
        {device.vulnerabilities && device.vulnerabilities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    ID
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {device.vulnerabilities.map((vuln, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {vuln.id || `VUL-${index + 1}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          vuln.severity === "high"
                            ? "bg-red-100 text-red-800"
                            : vuln.severity === "medium"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {vuln.severity || "low"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {vuln.description || "No description"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {vuln.status || "open"}
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
    </MainLayout>
  );
};

export default DeviceDetailsPage;
