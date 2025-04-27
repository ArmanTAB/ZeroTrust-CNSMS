// src/pages/Dashboard/DashboardPage.tsx
import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../components/Layout/MainLayout";
import { useAuth } from "../../store/AuthContext";
// @ts-ignore - Ignoring type errors for Recharts
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
  LineChart,
  Line,
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
    trusted: 0,
    untrusted: 0,
  });
  const [accessStats, setAccessStats] = useState<any>({
    total: 0,
    allowed: 0,
    denied: 0,
  });
  const [riskDistribution, setRiskDistribution] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Get device statistics
        const devices = await DevicesApi.getDeviceStatistics();
        setDeviceStats(devices);

        // Get access statistics for the last 7 days
        const access = await AccessApi.getAccessStatistics(7);
        setAccessStats(access);

        const alerts = await AccessApi.getSecurityAlerts(5);
        setSecurityAlerts(alerts);

        // Format risk distribution data
        if (devices.risk_distribution) {
          setRiskDistribution([
            {
              name: "Low Risk",
              value: devices.risk_distribution.low,
              color: "#10B981",
            },
            {
              name: "Medium Risk",
              value: devices.risk_distribution.medium,
              color: "#F59E0B",
            },
            {
              name: "High Risk",
              value: devices.risk_distribution.high,
              color: "#EF4444",
            },
          ]);
        }

        // Get activity data by day
        const activity = await AccessApi.getAccessActivity(7);
        setActivityData(activity);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  };

  return (
    <MainLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Security Dashboard
        </h1>
        <p className="text-gray-600">
          Good {getTimeOfDay()}, {user?.full_name}! Here's what's happening in
          your security network.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-blue-200"></div>
            <div className="w-12 h-12 rounded-full border-t-4 border-blue-600 animate-spin absolute top-0"></div>
          </div>
          <p className="ml-3 text-gray-600">Loading dashboard data...</p>
        </div>
      ) : (
        <>
          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="flex items-center p-5">
                <div className="rounded-full bg-blue-100 p-3 flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <div className="ml-5">
                  <p className="text-gray-500 text-sm">Total Devices</p>
                  <div className="flex items-center">
                    <h3 className="text-2xl font-bold text-blue-900">
                      {deviceStats.total}
                    </h3>
                    {deviceStats.total > 0 && (
                      <span className="ml-2 text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full inline-flex items-center">
                        {Math.round(
                          (deviceStats.active / deviceStats.total) * 100
                        )}
                        % Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="flex items-center p-5">
                <div className="rounded-full bg-green-100 p-3 flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div className="ml-5">
                  <p className="text-gray-500 text-sm">Trusted Devices</p>
                  <div className="flex items-center">
                    <h3 className="text-2xl font-bold text-green-800">
                      {deviceStats.trusted}
                    </h3>
                    {deviceStats.total > 0 && (
                      <span className="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                        {Math.round(
                          (deviceStats.trusted / deviceStats.total) * 100
                        )}
                        %
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="flex items-center p-5">
                <div className="rounded-full bg-yellow-100 p-3 flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-yellow-600"
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
                </div>
                <div className="ml-5">
                  <p className="text-gray-500 text-sm">Quarantined</p>
                  <div className="flex items-center">
                    <h3 className="text-2xl font-bold text-yellow-700">
                      {deviceStats.quarantined}
                    </h3>
                    {deviceStats.total > 0 && (
                      <span className="ml-2 text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                        {Math.round(
                          (deviceStats.quarantined / deviceStats.total) * 100
                        )}
                        %
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="flex items-center p-5">
                <div className="rounded-full bg-red-100 p-3 flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div className="ml-5">
                  <p className="text-gray-500 text-sm">Blocked Devices</p>
                  <div className="flex items-center">
                    <h3 className="text-2xl font-bold text-red-700">
                      {deviceStats.blocked}
                    </h3>
                    {deviceStats.total > 0 && (
                      <span className="ml-2 text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                        {Math.round(
                          (deviceStats.blocked / deviceStats.total) * 100
                        )}
                        %
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
            ref={containerRef}
          >
            {/* Device Risk Distribution */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Device Risk Distribution
                  </h3>
                  <div className="flex space-x-2">
                    {riskDistribution.map((entry, index) => (
                      <div
                        key={`legend-${index}`}
                        className="flex items-center"
                      >
                        <div
                          className="w-3 h-3 rounded-full mr-1"
                          style={{ backgroundColor: entry.color }}
                        ></div>
                        <span className="text-xs text-gray-600">
                          {entry.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {riskDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [
                          `${value} devices`,
                          "Count",
                        ]}
                        contentStyle={{
                          borderRadius: "0.375rem",
                          border: "none",
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                          fontSize: "0.75rem",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-gray-800">
                        {deviceStats.total}
                      </p>
                      <p className="text-sm text-gray-500">Total Devices</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Access Activity */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Access Activity (Last 7 Days)
                  </h3>
                  <div className="flex space-x-2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-1 bg-green-500"></div>
                      <span className="text-xs text-gray-600">Allowed</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-1 bg-red-500"></div>
                      <span className="text-xs text-gray-600">Denied</span>
                    </div>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activityData}
                      margin={{ top: 5, right: 5, left: 5, bottom: 20 }}
                      barGap={0}
                      barCategoryGap={10}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: "#E5E7EB" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "0.375rem",
                          border: "none",
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                          fontSize: "0.75rem",
                        }}
                      />
                      <Bar
                        dataKey="allowed"
                        name="Allowed Access"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="denied"
                        name="Denied Access"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Access Summary and Alerts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Access Summary */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Access Summary
                </h3>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Total Requests</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {accessStats.total}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Allowed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {accessStats.allowed}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Denied</p>
                    <p className="text-2xl font-bold text-red-600">
                      {accessStats.denied}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Success Rate
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {accessStats.total > 0
                        ? Math.round(
                            (accessStats.allowed / accessStats.total) * 100
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
                      style={{
                        width: `${
                          accessStats.total > 0
                            ? (accessStats.allowed / accessStats.total) * 100
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* View all access logs button */}
                <div className="mt-6">
                  <Link
                    to="/access-logs"
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center"
                  >
                    View all access logs
                    <svg
                      className="ml-1 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>

            {/* Security Alerts */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Recent Security Alerts
                </h3>
                <div className="space-y-4">
                  {securityAlerts.length === 0 ? (
                    <div className="flex items-center justify-center p-6 bg-gray-50 rounded-lg text-gray-500">
                      <svg
                        className="w-5 h-5 mr-2 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <span>No security alerts at the moment</span>
                    </div>
                  ) : (
                    securityAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors duration-150"
                      >
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            <span
                              className={`inline-flex items-center justify-center h-8 w-8 rounded-full ${
                                alert.severity === "high"
                                  ? "bg-red-100 text-red-600"
                                  : alert.severity === "medium"
                                  ? "bg-yellow-100 text-yellow-600"
                                  : "bg-blue-100 text-blue-600"
                              }`}
                            >
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
                          <div className="ml-3 flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-gray-900">
                                {alert.title}
                              </h4>
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  alert.severity === "high"
                                    ? "bg-red-100 text-red-700"
                                    : alert.severity === "medium"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {alert.severity}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">
                              {alert.description}
                            </p>
                            <div className="mt-2 flex items-center text-xs text-gray-500">
                              <svg
                                className="flex-shrink-0 mr-1 h-4 w-4 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {new Date(alert.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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
