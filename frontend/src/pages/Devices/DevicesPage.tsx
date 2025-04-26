// src/pages/Devices/DevicesPage.tsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../components/Layout/MainLayout";
import DevicesApi from "../../api/devices.api";
import { Device, DeviceStatus, DeviceType } from "../../types";

const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Состояние для фильтров
  const [filters, setFilters] = useState({
    device_type: "",
    status: "",
    is_trusted: undefined as boolean | undefined,
  });

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      try {
        const response = await DevicesApi.getAllDevices({
          device_type: filters.device_type || undefined,
          status: filters.status || undefined,
          is_trusted: filters.is_trusted,
        });
        setDevices(response);
      } catch (err: any) {
        console.error("Error fetching devices:", err);
        setError(err.message || "Failed to fetch devices");
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [filters]);

  // Обработчик изменения фильтров
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFilters((prev) => ({
      ...prev,
      [name]:
        name === "is_trusted"
          ? value === ""
            ? undefined
            : value === "true"
          : value,
    }));
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

  // Функция для отображения значка риска
  const getRiskBadge = (riskScore: number) => {
    if (riskScore <= 30) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          {riskScore}
        </span>
      );
    } else if (riskScore <= 70) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
          {riskScore}
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
          {riskScore}
        </span>
      );
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Devices</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Register New Device
        </button>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="device_type"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Device Type
            </label>
            <select
              id="device_type"
              name="device_type"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={filters.device_type}
              onChange={handleFilterChange}
            >
              <option value="">All Types</option>
              {Object.values(DeviceType).map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              {Object.values(DeviceStatus).map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="is_trusted"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Trust Status
            </label>
            <select
              id="is_trusted"
              name="is_trusted"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={
                filters.is_trusted === undefined
                  ? ""
                  : String(filters.is_trusted)
              }
              onChange={handleFilterChange}
            >
              <option value="">All</option>
              <option value="true">Trusted</option>
              <option value="false">Untrusted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Таблица устройств */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Device
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    IP Address
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
                    Risk Score
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Seen
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {devices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-4 text-center text-sm text-gray-500"
                    >
                      No devices found
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {device.hostname}
                            </div>
                            <div className="text-sm text-gray-500">
                              {device.device_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {device.device_type}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.os_type}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {device.ip_address}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.mac_address}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            device.status
                          )}`}
                        >
                          {device.status}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {device.is_trusted ? "Trusted" : "Untrusted"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRiskBadge(device.risk_score)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(device.last_seen).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/devices/${device.device_id}`}
                          className="text-blue-600 hover:text-blue-900 mx-2"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default DevicesPage;
