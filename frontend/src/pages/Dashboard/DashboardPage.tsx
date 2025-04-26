// src/pages/Dashboard/DashboardPage.tsx
import React, { useState, useEffect, useRef } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import { useAuth } from "../../store/AuthContext";
// @ts-ignore - Игнорирование ошибок типизации Recharts
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import DevicesApi from "../../api/devices.api";
import AccessApi from "../../api/access.api";

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceStats, setDeviceStats] = useState<any>({
    total: 0,
    active: 0,
    quarantined: 0,
    blocked: 0,
  });
  const [accessStats, setAccessStats] = useState<any>({
    total: 0,
    allowed: 0,
    denied: 0,
  });
  const [riskDistribution, setRiskDistribution] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Получаем статистику по устройствам
        const devices = await DevicesApi.getDeviceStatistics();
        setDeviceStats(devices);

        // Получаем статистику по доступу за последние 7 дней
        const access = await AccessApi.getAccessStatistics(7);
        setAccessStats(access);

        // Формируем данные для распределения рисков
        if (devices.risk_distribution) {
          setRiskDistribution([
            { name: "Low Risk (0-30)", value: devices.risk_distribution.low, color: "#10B981" },
            { name: "Medium Risk (31-70)", value: devices.risk_distribution.medium, color: "#F59E0B" },
            { name: "High Risk (71-100)", value: devices.risk_distribution.high, color: "#EF4444" },
          ]);
        }

        // Получаем данные по активности (здесь пока оставляем моки, 
        // так как у нас нет эндпоинта для получения активности по дням)
        setActivityData([
          { day: "Mon", allowed: 25, denied: 5 },
          { day: "Tue", allowed: 30, denied: 8 },
          { day: "Wed", allowed: 35, denied: 7 },
          { day: "Thu", allowed: 28, denied: 9 },
          { day: "Fri", allowed: 32, denied: 12 },
          { day: "Sat", allowed: 18, denied: 3 },
          { day: "Sun", allowed: 15, denied: 2 },
        ]);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Решение проблемы с ResponsiveContainer
  const renderPieChart = () => {
    if (loading || !containerRef.current) return null;

    return (
      <div style={{ width: "100%", height: 250 }}>
        {/* @ts-ignore */}
        <PieChart width={500} height={250}>
          {/* @ts-ignore */}
          <Pie
            data={riskDistribution}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
          >
            {riskDistribution.map((entry, index) => (
              /* @ts-ignore */
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          {/* @ts-ignore */}
          <Tooltip />
          {/* @ts-ignore */}
          <Legend />
        </PieChart>
      </div>
    );
  };

  const renderBarChart = () => {
    if (loading || !containerRef.current) return null;

    return (
      <div style={{ width: "100%", height: 250 }}>
        {/* @ts-ignore */}
        <BarChart width={500} height={250} data={activityData}>
          {/* @ts-ignore */}
          <CartesianGrid strokeDasharray="3 3" />
          {/* @ts-ignore */}
          <XAxis dataKey="day" />
          {/* @ts-ignore */}
          <YAxis />
          {/* @ts-ignore */}
          <Tooltip />
          {/* @ts-ignore */}
          <Legend />
          {/* @ts-ignore */}
          <Bar dataKey="allowed" fill="#10B981" name="Allowed Access" />
          {/* @ts-ignore */}
          <Bar dataKey="denied" fill="#EF4444" name="Denied Access" />
        </BarChart>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="pb-4">
        <h1 className="text-2xl font-bold text-gray-800">Security Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user?.full_name}</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Статистика карточки */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-gray-500 text-sm font-medium">
                Total Devices
              </h3>
              <div className="flex items-center">
                <div className="text-3xl font-bold text-gray-800">
                  {deviceStats.total}
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-gray-500 text-sm font-medium">
                Active Devices
              </h3>
              <div className="flex items-center">
                <div className="text-3xl font-bold text-green-600">
                  {deviceStats.active}
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-gray-500 text-sm font-medium">Quarantined</h3>
              <div className="flex items-center">
                <div className="text-3xl font-bold text-yellow-500">
                  {deviceStats.quarantined}
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-gray-500 text-sm font-medium">
                Blocked Devices
              </h3>
              <div className="flex items-center">
                <div className="text-3xl font-bold text-red-600">
                  {deviceStats.blocked}
                </div>
              </div>
            </div>
          </div>

          {/* Графики */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
            ref={containerRef}
          >
            {/* Распределение рисков устройств */}
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Device Risk Distribution
              </h3>
              <div className="h-64 flex items-center justify-center">
                {renderPieChart()}
              </div>
            </div>

            {/* Статистика доступов */}
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Access Activity (Last 7 Days)
              </h3>
              <div className="h-64 flex items-center justify-center">
                {renderBarChart()}
              </div>
            </div>
          </div>

          {/* Сводная информация о доступе */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Access Summary
              </h3>
              <div className="flex justify-around">
                <div className="text-center">
                  <p className="text-gray-600 text-sm">Total Requests</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {accessStats.total}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-sm">Allowed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {accessStats.allowed}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-sm">Denied</p>
                  <p className="text-2xl font-bold text-red-600">
                    {accessStats.denied}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">
                        Success Rate
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-green-600">
                        {accessStats.total > 0
                          ? Math.round(
                              (accessStats.allowed / accessStats.total) * 100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-200">
                    <div
                      style={{
                        width: `${
                          accessStats.total > 0
                            ? (accessStats.allowed / accessStats.total) * 100
                            : 0
                        }%`,
                      }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Recent Security Alerts
              </h3>
              <div className="divide-y divide-gray-200">
                <div className="py-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-red-100 text-red-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        Multiple login failures detected
                      </h4>
                      <p className="text-sm text-gray-500">
                        5 failed login attempts from IP 192.168.1.25
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        10 minutes ago
                      </p>
                    </div>
                  </div>
                </div>
                <div className="py-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-yellow-100 text-yellow-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        New device connected
                      </h4>
                      <p className="text-sm text-gray-500">
                        Unrecognized device with high risk score
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        45 minutes ago
                      </p>
                    </div>
                  </div>
                </div>
                <div className="py-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        System update available
                      </h4>
                      <p className="text-sm text-gray-500">
                        Security patch available for 12 devices
                      </p>
                      <p className="text-xs text-gray-400 mt-1">2 hours ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
};

export default DashboardPage;
