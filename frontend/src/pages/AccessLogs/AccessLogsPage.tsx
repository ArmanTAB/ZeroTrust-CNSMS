// src/pages/AccessLogs/AccessLogsPage.tsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../components/Layout/MainLayout";
import AccessApi from "../../api/access.api";
import { AccessLog, AccessType } from "../../types";
import { useToast } from "../../store/ToastContext";

// Enhanced AccessLog type that includes Drive access request logs and permission logs
interface EnhancedAccessLog {
  id: string;
  clientId?: string;
  device_id?: string;
  user_id?: string;
  user_email?: string; // Added for Drive logs
  ip_address?: string;
  user_agent?: string;
  resource: string;
  timestamp: string; // Common field across all log types
  access_type?: AccessType;
  context?: any;
  access_granted: boolean;
  reason?: string;
  risk_level?: number;
  decision_factors?: any[];
  // Additional fields for Drive access requests
  folder_id?: string;
  folder_name?: string;
  status?: string;
  decision_time?: string;
  decision_by?: string;
  decision_by_email?: string;
  // Type to identify source of the log
  log_type: "access" | "drive_request" | "permission";
  // Additional fields for permission logs
  role?: string;
  granted_at?: string;
  granted_by?: string;
  revoked_at?: string;
  revoked_by?: string;
}

const AccessLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<EnhancedAccessLog[]>([]);
  const [allLogs, setAllLogs] = useState<EnhancedAccessLog[]>([]); // Store all logs for client-side filtering
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(true);
  const { showToast } = useToast();
  const itemsPerPage = 10;

  // Filters
  const [filters, setFilters] = useState({
    device_id: "",
    access_granted: undefined as boolean | undefined,
    resource: "",
    start_time: "",
    end_time: "",
    log_type: "" as "" | "access" | "drive_request" | "permission",
    user_email: "",
    folder_id: "",
    status: "",
  });

  const enhanceLogs = (logs: any[], type: string): EnhancedAccessLog[] => {
    return logs.map((log, index) => ({
      ...log,
      log_type: type as "access" | "drive_request" | "permission",
      clientId: `${type}_${log.id}_${index}`, // Add a guaranteed unique identifier
    }));
  };

  // Then modify your fetchAllLogs function to use this enhancer
  const fetchAllLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create array to hold all log types
      let combinedLogs: EnhancedAccessLog[] = [];

      // Fetch regular access logs
      try {
        const accessLogs = await AccessApi.getAccessLogs({
          limit: 100, // Get more logs to have enough data for filtering
        });

        // Convert to enhanced format with unique keys
        combinedLogs = [...combinedLogs, ...enhanceLogs(accessLogs, "access")];
      } catch (err) {
        console.error("Error fetching access logs:", err);
        showToast(
          "Error fetching access logs. Other log types will still be displayed.",
          "warning"
        );
      }

      // Similar pattern for Drive requests and permissions...
      try {
        const driveRequests = await AccessApi.getDriveAccessRequests("");

        // Map with our enhanced function to ensure unique keys
        const enhancedDriveRequests = enhanceLogs(
          driveRequests.map((req) => ({
            id: req.id,
            user_id: req.user_id,
            user_email: req.user_email,
            device_id: req.device_id,
            ip_address: req.device_ip,
            resource: `Google Drive: ${req.folder_name}`,
            timestamp: req.request_time,
            folder_id: req.folder_id,
            folder_name: req.folder_name,
            status: req.status,
            decision_time: req.decision_time,
            decision_by: req.decision_by,
            decision_by_email: req.decision_by_email,
            access_granted: req.status === "approved",
            reason: req.reason,
          })),
          "drive_request"
        );

        combinedLogs = [...combinedLogs, ...enhancedDriveRequests];
      } catch (err) {
        // Error handling...
      }

      // And for permissions...
      try {
        const permissions = await AccessApi.getActivePermissions();

        const enhancedPermissions = enhanceLogs(
          permissions.map((perm) => ({
            id: perm.id,
            user_email: perm.user_email,
            resource: `Google Drive Permission: ${perm.folder_name}`,
            timestamp: perm.granted_at,
            folder_id: perm.folder_id,
            folder_name: perm.folder_name,
            access_granted: true,
            role: perm.role,
            granted_at: perm.granted_at,
            granted_by: perm.granted_by,
          })),
          "permission"
        );

        combinedLogs = [...combinedLogs, ...enhancedPermissions];
      } catch (err) {
        console.error("Error fetching permissions:", err);
        showToast(
          "Error fetching permissions. Other log types will still be displayed.",
          "warning"
        );
      }

      // Sort all logs by timestamp (newest first)
      combinedLogs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Store all logs
      setAllLogs(combinedLogs);

      // Apply initial filtering
      applyFilters(combinedLogs);
    } catch (err: any) {
      console.error("Error fetching logs:", err);
      setError(err.message || "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to the logs
  const applyFilters = (logsToFilter = allLogs) => {
    let filteredLogs = [...logsToFilter];

    // Filter by log type
    if (filters.log_type) {
      filteredLogs = filteredLogs.filter(
        (log) => log.log_type === filters.log_type
      );
    }

    // Filter by access granted
    if (filters.access_granted !== undefined) {
      filteredLogs = filteredLogs.filter(
        (log) => log.access_granted === filters.access_granted
      );
    }

    // Filter by resource
    if (filters.resource) {
      filteredLogs = filteredLogs.filter((log) =>
        log.resource.toLowerCase().includes(filters.resource.toLowerCase())
      );
    }

    // Filter by user email
    if (filters.user_email) {
      filteredLogs = filteredLogs.filter((log) =>
        log.user_email?.toLowerCase().includes(filters.user_email.toLowerCase())
      );
    }

    // Filter by device ID
    if (filters.device_id) {
      filteredLogs = filteredLogs.filter((log) =>
        log.device_id?.includes(filters.device_id)
      );
    }

    // Filter by folder ID
    if (filters.folder_id) {
      filteredLogs = filteredLogs.filter((log) =>
        log.folder_id?.includes(filters.folder_id)
      );
    }

    // Filter by status (for drive requests)
    if (filters.status) {
      filteredLogs = filteredLogs.filter(
        (log) => log.status === filters.status
      );
    }

    // Filter by date range
    if (filters.start_time) {
      const startDate = new Date(filters.start_time).getTime();
      filteredLogs = filteredLogs.filter(
        (log) => new Date(log.timestamp).getTime() >= startDate
      );
    }

    if (filters.end_time) {
      const endDate = new Date(filters.end_time).getTime();
      filteredLogs = filteredLogs.filter(
        (log) => new Date(log.timestamp).getTime() <= endDate
      );
    }

    // Calculate total pages
    const totalFilteredPages =
      Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    setTotalPages(totalFilteredPages);

    // Adjust current page if it's now out of bounds
    if (currentPage > totalFilteredPages) {
      setCurrentPage(1);
    }

    // Apply pagination
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedLogs = filteredLogs.slice(startIdx, endIdx);

    // Update logs state
    setLogs(paginatedLogs);
  };

  // Initial fetch on component mount
  useEffect(() => {
    fetchAllLogs();
  }, []);

  // Re-apply filters when page changes
  useEffect(() => {
    if (allLogs.length > 0) {
      applyFilters();
    }
  }, [currentPage]);

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "access_granted") {
      setFilters((prev) => ({
        ...prev,
        [name]: value === "" ? undefined : value === "true",
      }));
    } else {
      setFilters((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page when applying filters
    applyFilters();
  };

  const handleResetFilters = () => {
    setFilters({
      device_id: "",
      access_granted: undefined,
      resource: "",
      start_time: "",
      end_time: "",
      log_type: "",
      user_email: "",
      folder_id: "",
      status: "",
    });
    setCurrentPage(1);

    // Wait for state update before applying filters
    setTimeout(() => {
      applyFilters(allLogs);
    }, 0);
  };

  const refreshLogs = () => {
    fetchAllLogs();
  };

  const getAccessTypeStyle = (accessType?: AccessType) => {
    if (!accessType) return "bg-gray-100 text-gray-800 border-gray-200";

    switch (accessType) {
      case AccessType.READ:
        return "bg-blue-100 text-blue-800 border-blue-200";
      case AccessType.WRITE:
        return "bg-purple-100 text-purple-800 border-purple-200";
      case AccessType.DELETE:
        return "bg-red-100 text-red-800 border-red-200";
      case AccessType.ADMIN:
        return "bg-gray-100 text-gray-800 border-gray-200";
      case AccessType.EXECUTE:
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRiskLevelStyle = (riskLevel?: number) => {
    if (!riskLevel) return "bg-gray-100 text-gray-800 border-gray-200";

    if (riskLevel <= 30) {
      return "bg-green-100 text-green-800 border-green-200";
    } else if (riskLevel <= 70) {
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    } else {
      return "bg-red-100 text-red-800 border-red-200";
    }
  };

  const getRequestStatusStyle = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-800 border-gray-200";

    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPermissionRoleStyle = (role?: string) => {
    if (!role) return "bg-gray-100 text-gray-800 border-gray-200";

    switch (role) {
      case "reader":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "writer":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "owner":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Get appropriate icon for access type
  const getAccessTypeIcon = (accessType?: AccessType) => {
    if (!accessType) return null;

    switch (accessType) {
      case AccessType.READ:
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        );
      case AccessType.WRITE:
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        );
      case AccessType.DELETE:
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        );
      case AccessType.ADMIN:
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        );
      case AccessType.EXECUTE:
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-4 h-4"
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
        );
    }
  };

  // Get appropriate icon for log type
  const getLogTypeIcon = (logType: string) => {
    switch (logType) {
      case "access":
        return (
          <svg
            className="w-4 h-4"
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
        );
      case "drive_request":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        );
      case "permission":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-4 h-4"
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
        );
    }
  };

  // First, add a function to convert your logs to CSV format and download it

  const exportLogsToCSV = () => {
    // Show loading state
    const originalButtonText =
      document.getElementById("exportButton")?.innerText;
    if (document.getElementById("exportButton")) {
      document.getElementById("exportButton")!.innerText = "Exporting...";
    }

    try {
      // Use all logs instead of just the paginated ones
      const logsToExport = allLogs;

      if (logsToExport.length === 0) {
        showToast("No logs to export", "warning");
        return;
      }

      if (logsToExport.length > 0) {
        if (
          !window.confirm(
            `You are about to export ${logsToExport.length} logs. This may take a while. Continue?`
          )
        ) {
          return;
        }
      }

      // Define CSV headers based on all possible fields
      const headers = [
        "Time",
        "Type",
        "User Email",
        "Device ID",
        "IP Address",
        "Resource",
        "Access Type",
        "Status",
        "Access Granted",
        "Risk Level",
        "Reason",
        "Folder Name",
        "Decision Time",
        "Decision By",
      ];

      // Create CSV content
      let csvContent = headers.join(",") + "\n";

      // Add data rows
      logsToExport.forEach((log) => {
        const row = [
          // Format date for better readability in CSV
          new Date(log.timestamp).toLocaleString(),
          log.log_type,
          log.user_email || "",
          log.device_id || "",
          log.ip_address || "",
          // Escape any commas in the resource field to prevent breaking CSV format
          `"${log.resource.replace(/"/g, '""')}"`,
          log.access_type || "",
          log.status || "",
          log.access_granted.toString(),
          log.risk_level?.toString() || "",
          // Escape any commas in the reason field
          log.reason ? `"${log.reason.replace(/"/g, '""')}"` : "",
          log.folder_name ? `"${log.folder_name.replace(/"/g, '""')}"` : "",
          log.decision_time ? new Date(log.decision_time).toLocaleString() : "",
          log.decision_by_email || "",
        ];

        csvContent += row.join(",") + "\n";
      });

      // Create a Blob with the CSV content
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

      // Create a URL for the Blob
      const url = URL.createObjectURL(blob);

      // Create a download link
      const link = document.createElement("a");
      link.href = url;

      // Set filename with current date
      const now = new Date();
      const filename = `access_logs_export_${now.getFullYear()}-${(
        now.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}.csv`;
      link.setAttribute("download", filename);

      // Append link, trigger click, then remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success message
      showToast(`Exported ${logsToExport.length} logs to CSV`, "success");
    } catch (error) {
      console.error("Error exporting logs:", error);
      showToast("Failed to export logs", "error");
    } finally {
      // Reset button text
      if (document.getElementById("exportButton")) {
        document.getElementById("exportButton")!.innerText =
          originalButtonText || "Export Logs";
      }
    }
  };
  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Access Logs</h1>
            <p className="text-gray-600 mt-1">
              Review and monitor all access attempts and requests in your
              network
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              id="exportButton"
              onClick={exportLogsToCSV}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 flex items-center"
              disabled={loading || allLogs.length === 0}
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export Logs
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            className="flex items-center text-lg font-medium text-gray-700 hover:text-gray-900 focus:outline-none"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <svg
              className={`w-5 h-5 mr-2 transition-transform duration-200 ${
                isFilterOpen ? "transform rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
            Filters
          </button>
        </div>

        {isFilterOpen && (
          <div className="px-6 py-6 bg-gray-50">
            <form onSubmit={handleApplyFilters}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Access Granted filter */}
                <div>
                  <label
                    htmlFor="access_granted"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Access Status
                  </label>
                  <select
                    id="access_granted"
                    name="access_granted"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

                {/* Resource filter */}
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
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.resource}
                    onChange={handleFilterChange}
                    placeholder="Search resources"
                  />
                </div>

                {/* Start Time filter */}
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
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.start_time}
                    onChange={handleFilterChange}
                  />
                </div>

                {/* End Time filter */}
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
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.end_time}
                    onChange={handleFilterChange}
                  />
                </div>

                {/* Log Type filter */}
                <div>
                  <label
                    htmlFor="log_type"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Log Type
                  </label>
                  <select
                    id="log_type"
                    name="log_type"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.log_type}
                    onChange={handleFilterChange}
                  >
                    <option value="">All Types</option>
                    <option value="access">Access</option>
                    <option value="drive_request">Drive Request</option>
                    <option value="permission">Permission</option>
                  </select>
                </div>

                {/* User Email filter */}
                <div>
                  <label
                    htmlFor="user_email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    User Email
                  </label>
                  <input
                    type="text"
                    id="user_email"
                    name="user_email"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.user_email}
                    onChange={handleFilterChange}
                    placeholder="Filter by email"
                  />
                </div>

                {/* Folder ID filter */}
                <div>
                  <label
                    htmlFor="folder_id"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Folder ID
                  </label>
                  <input
                    type="text"
                    id="folder_id"
                    name="folder_id"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={filters.folder_id}
                    onChange={handleFilterChange}
                    placeholder="Filter by folder ID"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors duration-200"
                  onClick={handleResetFilters}
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200"
                >
                  Apply Filters
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-blue-200"></div>
            <div className="w-12 h-12 rounded-full border-t-4 border-blue-600 animate-spin absolute top-0"></div>
          </div>
          <p className="ml-3 text-gray-600">Loading access logs...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <div className="flex">
            <svg
              className="h-5 w-5 text-red-600 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium">Error:</span>
            <span className="ml-1">{error}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden w-full">
            {/* Make the container responsive */}
            <div
              className="w-full overflow-x-auto"
              style={{ maxWidth: "100%" }}
            >
              {logs.length === 0 ? (
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
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <h3 className="mt-2 text-lg font-medium text-gray-900">
                    No access logs found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Try adjusting your filters or check back later.
                  </p>
                </div>
              ) : (
                <table className="w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-32"
                      >
                        Time
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-28"
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32 sm:w-40"
                      >
                        User
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32 sm:w-40"
                      >
                        Resource
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-32"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-32"
                      >
                        Info
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr
                        key={log.clientId || `${log.log_type}_${log.id}`}
                        className="hover:bg-gray-50 transition-colors duration-150"
                      >
                        <td className="px-3 py-3 text-sm text-gray-500">
                          {new Date(log.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center">
                            <span className="mr-1 flex-shrink-0">
                              {getLogTypeIcon(log.log_type)}
                            </span>
                            <span className="text-xs text-gray-900 truncate">
                              {log.log_type === "access"
                                ? "Access"
                                : log.log_type === "drive_request"
                                ? "Request"
                                : "Permission"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {log.user_email ? (
                            <div className="text-xs font-medium text-gray-900 break-words max-w-[120px] sm:max-w-[160px]">
                              {log.user_email}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-xs">
                              N/A
                            </span>
                          )}
                          {log.device_id && (
                            <div className="text-xs text-gray-500 break-words max-w-[120px] sm:max-w-[160px]">
                              ID: {log.device_id}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-900">
                          <div className="text-xs bg-gray-100 px-2 py-1 rounded break-words max-w-[120px] sm:max-w-[160px]">
                            {log.resource}
                          </div>
                          {log.folder_name && (
                            <div className="text-xs text-gray-500 mt-1 break-words max-w-[120px] sm:max-w-[160px]">
                              {log.folder_name}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col space-y-1">
                            {log.log_type === "access" && log.access_type && (
                              <div
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${getAccessTypeStyle(
                                  log.access_type
                                )}`}
                              >
                                <span className="mr-1">
                                  {getAccessTypeIcon(log.access_type)}
                                </span>
                                <span className="truncate max-w-[60px] sm:max-w-full">
                                  {log.access_type}
                                </span>
                              </div>
                            )}

                            {log.log_type === "drive_request" && log.status && (
                              <div
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${getRequestStatusStyle(
                                  log.status
                                )}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                    log.status === "approved"
                                      ? "bg-green-600"
                                      : log.status === "rejected"
                                      ? "bg-red-600"
                                      : "bg-yellow-600"
                                  }`}
                                ></span>
                                <span className="truncate max-w-[60px] sm:max-w-full">
                                  {log.status}
                                </span>
                              </div>
                            )}

                            {log.log_type === "permission" && log.role && (
                              <div
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${getPermissionRoleStyle(
                                  log.role
                                )}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full mr-1 bg-blue-600`}
                                ></span>
                                <span className="truncate max-w-[60px] sm:max-w-full">
                                  {log.role}
                                </span>
                              </div>
                            )}

                            <div>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${
                                  log.access_granted
                                    ? "bg-green-100 text-green-800 border-green-200"
                                    : "bg-red-100 text-red-800 border-red-200"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                    log.access_granted
                                      ? "bg-green-600"
                                      : "bg-red-600"
                                  }`}
                                ></span>
                                <span className="truncate max-w-[60px] sm:max-w-full">
                                  {log.access_granted ? "Granted" : "Denied"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {log.log_type === "access" &&
                          log.risk_level !== undefined ? (
                            <div
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${getRiskLevelStyle(
                                log.risk_level
                              )}`}
                            >
                              <span className="mr-1">
                                {log.risk_level <= 30 ? (
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : log.risk_level <= 70 ? (
                                  <svg
                                    className="w-3 h-3"
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
                                ) : (
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                )}
                              </span>
                              {log.risk_level}
                            </div>
                          ) : null}

                          {log.reason ? (
                            <div className="text-xs text-gray-500 mt-1 break-words max-w-[80px] sm:max-w-[120px]">
                              {log.reason}
                            </div>
                          ) : null}

                          {log.log_type === "drive_request" &&
                          log.decision_by_email ? (
                            <div className="text-xs text-gray-500 mt-1 break-words max-w-[80px] sm:max-w-[120px]">
                              By: {log.decision_by_email}
                            </div>
                          ) : null}

                          {log.log_type === "permission" && log.granted_by ? (
                            <div className="text-xs text-gray-500 mt-1 break-words max-w-[80px] sm:max-w-[120px]">
                              {log.granted_by}
                            </div>
                          ) : null}

                          {/* Show 'no info' if none of the above rendered */}
                          {!(
                            (log.log_type === "access" &&
                              log.risk_level !== undefined) ||
                            log.reason ||
                            (log.log_type === "drive_request" &&
                              log.decision_by_email) ||
                            (log.log_type === "permission" && log.granted_by)
                          ) && (
                            <div className="text-xs text-gray-500">
                              No info found
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Pagination */}
          {logs.length > 0 && totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <nav className="inline-flex rounded-md shadow-sm isolate">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-4 py-2 rounded-l-md border ${
                    currentPage === 1
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
                      : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                  } text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                >
                  <svg
                    className="w-5 h-5 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Previous
                </button>
                <span className="relative inline-flex items-center px-4 py-2 border-t border-b border-gray-300 bg-blue-600 text-white text-sm font-medium">
                  {currentPage}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-4 py-2 rounded-r-md border ${
                    currentPage === totalPages
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
                      : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                  } text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                >
                  Next
                  <svg
                    className="w-5 h-5 ml-1"
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
