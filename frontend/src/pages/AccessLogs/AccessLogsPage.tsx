// src/pages/AccessLogs/AccessLogsPage.tsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../components/Layout/MainLayout";
import AccessApi from "../../api/access.api";
import { AccessLog, AccessType } from "../../types";

const AccessLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const itemsPerPage = 10;

  // Фильтры
  const [filters, setFilters] = useState({
    device_id: "",
    access_granted: undefined as boolean | undefined,
    resource: "",
    start_time: "",
    end_time: "",
  });

  useEffect(() => {
    fetchLogs();
  }, [currentPage, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Подготовка параметров с учетом пагинации и фильтров
      const params: any = {
        skip: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
      };

      // Добавляем фильтры, если они заданы
      if (filters.device_id) params.device_id = filters.device_id;
      if (filters.access_granted !== undefined)
        params.access_granted = filters.access_granted;
      if (filters.resource) params.resource = filters.resource;
      if (filters.start_time) params.start_time = new Date(filters.start_time);
      if (filters.end_time) params.end_time = new Date(filters.end_time);

      const response = await AccessApi.getAccessLogs(params);
      setLogs(response);

      // В реальном приложении API должен возвращать общее количество записей
      // Здесь для примера мы просто задаем общее количество страниц
      setTotalPages(Math.ceil(response.length / itemsPerPage) || 1);
    } catch (err: any) {
      console.error("Error fetching access logs:", err);
      setError(err.message || "Failed to fetch access logs");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFilters((prev) => ({
      ...prev,
      [name]:
        name === "access_granted"
          ? value === ""
            ? undefined
            : value === "true"
          : value,
    }));
  };

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Сбрасываем страницу на первую при применении фильтров
    fetchLogs();
  };

  const handleResetFilters = () => {
    setFilters({
      device_id: "",
      access_granted: undefined,
      resource: "",
      start_time: "",
      end_time: "",
    });
    setCurrentPage(1);
  };

  const getAccessTypeStyle = (accessType: AccessType) => {
    switch (accessType) {
      case AccessType.READ:
        return "bg-blue-100 text-blue-800";
      case AccessType.WRITE:
        return "bg-purple-100 text-purple-800";
      case AccessType.DELETE:
        return "bg-red-100 text-red-800";
      case AccessType.ADMIN:
        return "bg-gray-100 text-gray-800";
      case AccessType.EXECUTE:
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRiskLevelStyle = (riskLevel: number) => {
    if (riskLevel <= 30) {
      return "bg-green-100 text-green-800";
    } else if (riskLevel <= 70) {
      return "bg-yellow-100 text-yellow-800";
    } else {
      return "bg-red-100 text-red-800";
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Access Logs</h1>
        <p className="text-gray-600">
          Review and monitor all access attempts in your network
        </p>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <h2 className="text-lg font-semibold mb-3">Filters</h2>
        <form onSubmit={handleApplyFilters}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label
                htmlFor="device_id"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Device ID
              </label>
              <input
                type="text"
                id="device_id"
                name="device_id"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={filters.device_id}
                onChange={handleFilterChange}
                placeholder="Enter device ID"
              />
            </div>
            <div>
              <label
                htmlFor="resource"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Resource
              </label>
              <input
                type="text"
                id="resource"
                name="resource"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={filters.resource}
                onChange={handleFilterChange}
                placeholder="e.g. /api/finance"
              />
            </div>
            <div>
              <label
                htmlFor="access_granted"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Access Result
              </label>
              <select
                id="access_granted"
                name="access_granted"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={
                  filters.access_granted === undefined
                    ? ""
                    : String(filters.access_granted)
                }
                onChange={handleFilterChange}
              >
                <option value="">All</option>
                <option value="true">Granted</option>
                <option value="false">Denied</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label
                htmlFor="start_time"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Start Date
              </label>
              <input
                type="datetime-local"
                id="start_time"
                name="start_time"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={filters.start_time}
                onChange={handleFilterChange}
              />
            </div>
            <div>
              <label
                htmlFor="end_time"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                End Date
              </label>
              <input
                type="datetime-local"
                id="end_time"
                name="end_time"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={filters.end_time}
                onChange={handleFilterChange}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              onClick={handleResetFilters}
            >
              Reset
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Apply Filters
            </button>
          </div>
        </form>
      </div>

      {/* Таблица логов */}
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
        <>
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Timestamp
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Device ID
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      User
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Resource
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Access Type
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Result
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Risk Level
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-4 text-center text-sm text-gray-500"
                      >
                        No access logs found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            to={`/devices/${log.device_id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {log.device_id}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.user_id || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.resource}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${getAccessTypeStyle(
                              log.access_type
                            )}`}
                          >
                            {log.access_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.access_granted
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {log.access_granted ? "Granted" : "Denied"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskLevelStyle(
                              log.risk_level
                            )}`}
                          >
                            {log.risk_level}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-l-md focus:z-10 focus:outline-none ${
                    currentPage === 1
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Previous
                </button>
                <span className="px-3 py-1 bg-blue-600 text-white">
                  {currentPage}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-r-md focus:z-10 focus:outline-none ${
                    currentPage === totalPages
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Next
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
};

export default AccessLogsPage;
