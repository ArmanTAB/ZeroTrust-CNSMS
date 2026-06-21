// src/pages/Dashboard/DashboardPage.tsx
import React, { useEffect, useState } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import DevicesApi from "../../api/devices.api";
import AccessApi from "../../api/access.api";
import { DeviceStatus } from "../../types";
import { Link } from "react-router-dom";
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
import AccessRequestsSummary from "../../components/GoogleDrive/AccessRequestsSummary";

const DashboardPage: React.FC = () => {
  const [deviceStats, setDeviceStats] = useState<any>({
    total: 0,
    active: 0,
    inactive: 0,
    quarantined: 0,
    blocked: 0,
    pending: 0,
    trusted: 0,
    untrusted: 0,
    risk_distribution: {
      low: 0,
      medium: 0,
      high: 0,
    },
  });

  const [accessActivity, setAccessActivity] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [driveRequests, setDriveRequests] = useState<any>({
    total: 0,
    pending: 0,
    recent_pending: [],
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch device statistics
        const deviceStatistics = await DevicesApi.getDeviceStatistics();
        setDeviceStats(deviceStatistics);

        // Fetch access activity
        const activityData = await AccessApi.getAccessActivity(7);
        setAccessActivity(activityData);

        // Fetch security alerts
        const alertsData = await AccessApi.getSecurityAlerts(5);
        setAlerts(alertsData);

        // Fetch Google Drive access requests summary
        try {
          const driveRequestsData = await AccessApi.getAccessRequestsSummary();
          setDriveRequests(driveRequestsData);
        } catch (err) {
          console.error("Error fetching drive requests:", err);
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Prepare device status data for pie chart
  const deviceStatusData = [
    { name: "Active", value: deviceStats.active, color: "#4ade80" },
    { name: "Inactive", value: deviceStats.inactive, color: "#94a3b8" },
    { name: "Quarantined", value: deviceStats.quarantined, color: "#facc15" },
    { name: "Blocked", value: deviceStats.blocked, color: "#f87171" },
    { name: "Pending", value: deviceStats.pending, color: "#60a5fa" },
  ].filter((item) => item.value > 0);

  // Prepare risk distribution data for pie chart
  const riskDistributionData = [
    {
      name: "Low Risk",
      value: deviceStats.risk_distribution.low,
      color: "#4ade80",
    },
    {
      name: "Medium Risk",
      value: deviceStats.risk_distribution.medium,
      color: "#facc15",
    },
    {
      name: "High Risk",
      value: deviceStats.risk_distribution.high,
      color: "#f87171",
    },
  ].filter((item) => item.value > 0);

  // Get severity style for alerts
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Security Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of your Zero Trust security posture
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-[#1E2761] border-opacity-25"></div>
            <div className="w-12 h-12 rounded-full border-t-4 border-[#408EC6] animate-spin absolute top-0"></div>
          </div>
          <p className="ml-3 text-gray-600">Loading dashboard data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Statistics Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-[#1E2761] text-white">
              <h2 className="text-lg font-semibold">Device Status</h2>
            </div>
            <div className="p-6 flex flex-col md:flex-row">
              <div className="flex-1 mb-4 md:mb-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#1E2761]">
                      {deviceStats.total}
                    </div>
                    <div className="text-sm text-gray-500">Total Devices</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#408EC6]">
                      {deviceStats.active}
                    </div>
                    <div className="text-sm text-gray-500">Active Devices</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-500">
                      {deviceStats.trusted}
                    </div>
                    <div className="text-sm text-gray-500">Trusted</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#7A2048]">
                      {deviceStats.untrusted}
                    </div>
                    <div className="text-sm text-gray-500">Untrusted</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center h-48">
                {deviceStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceStatusData}
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={(entry: { name: string }) => entry.name}
                        labelLine={true}
                      >
                        {deviceStatusData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="#fff"
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-gray-500">
                    No device status data available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Risk Distribution Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-[#1E2761] text-white">
              <h2 className="text-lg font-semibold">Risk Distribution</h2>
            </div>
            <div className="p-6 flex items-center justify-center h-64">
              {riskDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistributionData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={(entry: { name: string }) => entry.name}
                      labelLine={true}
                    >
                      {riskDistributionData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="#fff"
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-500">
                  No risk distribution data available
                </div>
              )}
            </div>
          </div>

          {/* Access Activity Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-[#1E2761] text-white">
              <h2 className="text-lg font-semibold">
                Access Activity (7 Days)
              </h2>
            </div>
            <div className="p-6 flex items-center justify-center h-64">
              {accessActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={accessActivity}
                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="allowed"
                      name="Allowed"
                      stackId="a"
                      fill="#4ade80"
                    />
                    <Bar
                      dataKey="denied"
                      name="Denied"
                      stackId="a"
                      fill="#f87171"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-500">
                  No access activity data available
                </div>
              )}
            </div>
          </div>

          {/* Security Alerts Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[#1E2761] text-white">
              <h2 className="text-lg font-semibold">Recent Security Alerts</h2>
              <Link
                to="/access-logs"
                className="text-sm text-[#408EC6] hover:text-[#7A2048] bg-white px-3 py-1 rounded-md"
              >
                View All
              </Link>
            </div>
            <div className="p-4">
              {alerts.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {alerts.map((alert, index) => (
                    <div key={index} className="py-3">
                      <div className="flex items-start">
                        <div
                          className={`mt-0.5 w-2 h-2 rounded-full mr-2 ${
                            alert.severity === "high"
                              ? "bg-red-500"
                              : alert.severity === "medium"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                        ></div>
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900">
                            {alert.title}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {alert.description}
                          </p>
                          <div className="flex items-center mt-1 space-x-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSeverityStyle(
                                alert.severity
                              )}`}
                            >
                              {alert.severity}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(alert.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center">
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No security alerts
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    There are no security alerts to display at this time.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Google Drive Access Requests Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[#1E2761] text-white">
              <h2 className="text-lg font-semibold">
                Google Drive Access Requests
              </h2>
              <Link
                to="/google-drive"
                className="text-sm text-[#408EC6] hover:text-[#7A2048] bg-white px-3 py-1 rounded-md"
              >
                Manage Access
              </Link>
            </div>
            <div className="p-4">
              <AccessRequestsSummary />
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default DashboardPage;
