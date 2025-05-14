// frontend/src/pages/Agent/AgentDashboardPage.tsx
import React, { useState, useEffect } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import { Link } from "react-router-dom";
import AgentApi from "../../api/agent.api";
import { AgentRuleType, AgentActivityType } from "../../types/agent";
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

const AgentDashboardPage: React.FC = () => {
  const [statistics, setStatistics] = useState<any>({
    users: {
      total: 0,
      active: 0,
      inactive: 0,
    },
    rules: {
      total: 0,
      allow: 0,
      block: 0,
      active: 0,
      inactive: 0,
    },
    activities: {
      total: 0,
      allowed: 0,
      blocked: 0,
    },
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch statistics
        const stats = await AgentApi.getStatistics();
        setStatistics(stats);

        // Fetch recent activities
        const activities = await AgentApi.getActivities({ limit: 10 });
        setRecentActivities(activities);
      } catch (error) {
        console.error("Error loading agent dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Prepare data for user status chart
  const userStatusData = [
    { name: "Active", value: statistics.users.active, color: "#4ade80" },
    { name: "Inactive", value: statistics.users.inactive, color: "#f87171" },
  ].filter((item) => item.value > 0);

  // Prepare data for rule types chart
  const ruleTypesData = [
    { name: "Allow Rules", value: statistics.rules.allow, color: "#4ade80" },
    { name: "Block Rules", value: statistics.rules.block, color: "#f87171" },
  ].filter((item) => item.value > 0);

  // Prepare data for activity results chart
  const activityResultsData = [
    { name: "Allowed", value: statistics.activities.allowed, color: "#4ade80" },
    { name: "Blocked", value: statistics.activities.blocked, color: "#f87171" },
  ].filter((item) => item.value > 0);

  // Function to get activity icon
  const getActivityIcon = (type: AgentActivityType) => {
    switch (type) {
      case AgentActivityType.NETWORK:
        return "🌐";
      case AgentActivityType.PROCESS:
        return "🖥️";
      case AgentActivityType.FILE:
        return "📁";
      default:
        return "⚙️";
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Agent Management</h1>
          <p className="text-gray-600 mt-1">
            Manage and monitor your Zero Trust agent deployments
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
            {/* Users Card */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[#1E2761] text-white">
                <h2 className="text-lg font-semibold">Agent Users</h2>
                <Link
                  to="/agent/users"
                  className="text-sm text-[#408EC6] hover:text-[#7A2048] bg-white px-3 py-1 rounded-md"
                >
                  Manage Users
                </Link>
              </div>
              <div className="p-6 flex flex-col md:flex-row">
                <div className="flex-1 mb-4 md:mb-0">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-[#1E2761]">
                        {statistics.users.total}
                      </div>
                      <div className="text-sm text-gray-500">Total Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-500">
                        {statistics.users.active}
                      </div>
                      <div className="text-sm text-gray-500">Active</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-500">
                        {statistics.users.inactive}
                      </div>
                      <div className="text-sm text-gray-500">Inactive</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center h-48">
                  {userStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={userStatusData}
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                          label
                        >
                          {userStatusData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="#fff"
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-gray-500">
                      No user data available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rules Card */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-[#1E2761] text-white">
                <h2 className="text-lg font-semibold">Access Rules</h2>
                <Link
                  to="/agent/rules"
                  className="text-sm text-[#408EC6] hover:text-[#7A2048] bg-white px-3 py-1 rounded-md"
                >
                  Manage Rules
                </Link>
              </div>
              <div className="p-6 flex flex-col md:flex-row">
                <div className="flex-1 mb-4 md:mb-0">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-[#1E2761]">
                        {statistics.rules.total}
                      </div>
                      <div className="text-sm text-gray-500">Total Rules</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-500">
                        {statistics.rules.allow}
                      </div>
                      <div className="text-sm text-gray-500">Allow</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-500">
                        {statistics.rules.block}
                      </div>
                      <div className="text-sm text-gray-500">Block</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center h-48">
                  {ruleTypesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ruleTypesData}
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                          label
                        >
                          {ruleTypesData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="#fff"
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-gray-500">
                      No rule data available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Activities Card */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden lg:col-span-2">
              <div className="px-6 py-4 border-b border-gray-200 bg-[#1E2761] text-white">
                <h2 className="text-lg font-semibold">Recent Activities</h2>
              </div>
              <div className="p-6">
                {recentActivities.length > 0 ? (
                  <div className="overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
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
                              Resource
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
                              Rule
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              Time
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {recentActivities.map((activity, index) => (
                            <tr key={index}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <span className="text-xl mr-2">
                                    {getActivityIcon(activity.type)}
                                  </span>
                                  <span className="capitalize">
                                    {activity.type.toLowerCase()}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900 truncate max-w-xs">
                                  {activity.resource}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    activity.blocked
                                      ? "bg-red-100 text-red-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {activity.blocked ? "Blocked" : "Allowed"}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {activity.ruleName || "N/A"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(activity.timestamp).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No activities found
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      No agent activities have been recorded yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default AgentDashboardPage;
