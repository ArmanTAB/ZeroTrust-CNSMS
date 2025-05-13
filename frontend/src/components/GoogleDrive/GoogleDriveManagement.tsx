// frontend/src/components/GoogleDrive/GoogleDriveManagement.tsx
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";
import AccessApi from "../../api/access.api";

// Define interfaces for data structures
interface Folder {
  id: string;
  name: string;
  sensitivity: string;
  sensitivityLabel?: {
    label: string;
    class: string;
  };
  hasPendingRequest?: boolean;
}

interface AccessRequest {
  drive_error: any;
  id: string;
  user_id: string;
  user_email: string;
  folder_id: string;
  folder_name: string;
  device_id?: string;
  device_ip?: string;
  request_time: string;
  status: "pending" | "approved" | "rejected";
  decision_time?: string;
  decision_by?: string;
  decision_by_email?: string;
  reason?: string;
  source?: string; // Added to track source of request
  external_id?: string; // Added to track external ID
}

interface FilterState {
  search: string;
  status: string;
}

interface ActivePermission {
  id: string; // Permission ID
  folder_id: string; // Google Drive folder ID
  folder_name: string; // Folder name
  user_email: string; // User email who has access
  role: string; // Permission role (e.g., "reader", "writer", "owner")
  granted_at: string; // When the permission was granted
  granted_by: string; // Who granted the permission
  expiration?: string; // Optional expiration date
}

const GoogleDriveManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  // State for access request modal
  const [showRequestModal, setShowRequestModal] = useState<boolean>(false);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [requestEmail, setRequestEmail] = useState<string>("");
  const [requestingAccess, setRequestingAccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<
    "folders" | "requests" | "permissions"
  >("folders");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [processingRequest, setProcessingRequest] = useState<string | null>(
    null
  );
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(
    null
  );
  const [filter, setFilter] = useState<FilterState>({
    search: "",
    status: "", // Changed from "pending" to empty string for "All"
  });
  const [syncingFolders, setSyncingFolders] = useState<boolean>(false);
  const [syncingGmail, setSyncingGmail] = useState<boolean>(false);
  const [scanningFolders, setScanningFolders] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [activePermissions, setActivePermissions] = useState<
    ActivePermission[]
  >([]);
  const [loadingPermissions, setLoadingPermissions] = useState<boolean>(false);

  const [showRevokeConfirmModal, setShowRevokeConfirmModal] =
    useState<boolean>(false);
  const [permissionToRevoke, setPermissionToRevoke] = useState<string | null>(
    null
  );
  // Refs for tracking intervals
  const folderSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gmailSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "security_analyst";

  // Set up auto-sync intervals
  useEffect(() => {
    if (autoSyncEnabled && isAdmin) {
      // Set up intervals for auto-syncing
      folderSyncIntervalRef.current = setInterval(() => {
        if (activeTab === "folders") {
          fetchFolders(false); // silent refresh
        }
      }, 15000); // 15 seconds

      gmailSyncIntervalRef.current = setInterval(() => {
        if (activeTab === "requests") {
          handleSyncGmailRequests(true); // silent refresh
        }
      }, 15000); // 15 seconds
    }

    // Cleanup intervals when component unmounts or auto-sync is disabled
    return () => {
      if (folderSyncIntervalRef.current) {
        clearInterval(folderSyncIntervalRef.current);
      }
      if (gmailSyncIntervalRef.current) {
        clearInterval(gmailSyncIntervalRef.current);
      }
    };
  }, [autoSyncEnabled, activeTab, isAdmin]);

  useEffect(() => {
    if (activeTab === "folders") {
      fetchFolders();
    } else {
      // When switching to the requests tab, fetch with current filter status
      fetchAccessRequests();
    }
  }, [activeTab]);

  const fetchFolders = async (showLoadingState = true): Promise<void> => {
    if (showLoadingState) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await AccessApi.getGoogleDriveFolders();

      // Process folders with sensitivity labels
      const foldersWithLabels = response.map((folder: Folder) => ({
        ...folder,
        sensitivityLabel: getSensitivityLabel(folder.sensitivity),
      }));

      console.log("Fetched folders:", foldersWithLabels);
      setFolders(foldersWithLabels);

      if (!showLoadingState) {
        setLastSyncTime(new Date());
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      if (showLoadingState) {
        setError(
          "Failed to fetch Google Drive folders. Please make sure the service account has access to your Google Drive."
        );
        showToast("Failed to fetch Google Drive folders", "error");
      }
    } finally {
      if (showLoadingState) {
        setLoading(false);
      }
    }
  };

  const fetchAccessRequests = async (
    statusOverride?: string,
    silent = false
  ): Promise<void> => {
    if (!isAdmin) return;

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      // Use the override status value if provided, otherwise use the current filter status
      const statusToUse =
        statusOverride !== undefined ? statusOverride : filter.status;
      console.log("Fetching access requests with status:", statusToUse);

      const requests = await AccessApi.getDriveAccessRequests(statusToUse);
      console.log("Retrieved requests:", requests);

      // Filter by search term if provided
      const filteredRequests = filter.search
        ? requests.filter(
            (req: AccessRequest) =>
              req.user_email
                .toLowerCase()
                .includes(filter.search.toLowerCase()) ||
              req.folder_name
                .toLowerCase()
                .includes(filter.search.toLowerCase())
          )
        : requests;

      setAccessRequests(filteredRequests);

      if (silent) {
        setLastSyncTime(new Date());
      }
    } catch (error) {
      console.error("Error fetching access requests:", error);

      if (!silent) {
        // More detailed error message
        if (error instanceof Error) {
          setError(`Failed to fetch access requests: ${error.message}`);
          showToast(
            `Failed to fetch access requests: ${error.message}`,
            "error"
          );
        } else {
          setError("Failed to fetch access requests");
          showToast("Failed to fetch access requests", "error");
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const fetchActivePermissions = async (silent = false): Promise<void> => {
    if (!isAdmin) return;

    if (!silent) {
      setLoadingPermissions(true);
    }
    setError(null);

    try {
      // Call the API to get active permissions
      const permissions = await AccessApi.getActivePermissions();
      setActivePermissions(permissions);

      if (silent) {
        setLastSyncTime(new Date());
      }
    } catch (error) {
      console.error("Error fetching active permissions:", error);

      if (!silent) {
        if (error instanceof Error) {
          setError(`Failed to fetch active permissions: ${error.message}`);
          showToast(
            `Failed to fetch active permissions: ${error.message}`,
            "error"
          );
        } else {
          setError("Failed to fetch active permissions");
          showToast("Failed to fetch active permissions", "error");
        }
      }
    } finally {
      if (!silent) {
        setLoadingPermissions(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab === "folders") {
      fetchFolders();
    } else if (activeTab === "requests") {
      fetchAccessRequests();
    } else if (activeTab === "permissions") {
      fetchActivePermissions();
    }
  }, [activeTab]);

  const resetFilters = (): void => {
    setFilter({ search: "", status: "" });
    // Delay fetching until state is set
    setTimeout(() => {
      fetchAccessRequests("");
    }, 0);
  };

  const handleSyncGmailRequests = async (silent = false): Promise<void> => {
    if (!isAdmin) return;

    if (!silent) {
      setSyncingGmail(true);
    }

    try {
      const result = await AccessApi.syncGmailShareRequests();

      if (!silent) {
        showToast(
          `Successfully synced ${result.total_found} Gmail requests (${result.new_created} new)`,
          "success"
        );
      }

      // Refresh access requests
      if (activeTab === "requests") {
        await fetchAccessRequests(undefined, silent);
      }

      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error("Error syncing Gmail requests:", err);
      if (!silent) {
        showToast(err.message || "Error syncing Gmail requests", "error");
      }
    } finally {
      if (!silent) {
        setSyncingGmail(false);
      }
    }
  };

  const handleRequestAccess = async (folder: Folder): Promise<void> => {
    setSelectedFolder(folder);
    setShowRequestModal(true);
  };

  const submitAccessRequest = async (): Promise<void> => {
    if (!selectedFolder || !requestEmail) return;

    setRequestingAccess(true);
    try {
      // Create a custom format to include the email for permission
      const folderId = selectedFolder.id;
      const resource = `google-drive:folder:${folderId}:${requestEmail}`;

      const result = await AccessApi.requestGoogleDriveAccess(
        selectedFolder.id,
        requestEmail
      );

      // Check result status
      if (result.status === "success" && result.access_granted) {
        showToast(
          result.message || `Access granted to ${requestEmail}`,
          "success"
        );

        // Close the modal after successful request
        setShowRequestModal(false);
      } else if (result.status === "pending") {
        showToast(
          `Access request for ${requestEmail} submitted and is pending approval`,
          "info"
        );

        // Update folder in state to show pending request
        setFolders((prev) =>
          prev.map((f) =>
            f.id === selectedFolder.id ? { ...f, hasPendingRequest: true } : f
          )
        );

        // Close the modal after successful request
        setShowRequestModal(false);
      } else {
        showToast(result.message || "Request submitted", "info");
        // Close the modal after successful request
        setShowRequestModal(false);
      }
    } catch (error) {
      console.error("Error requesting access:", error);
      showToast("Failed to request access", "error");
    } finally {
      setRequestingAccess(false);
    }
  };

  const handleApproveRequest = async (requestId: string): Promise<void> => {
    setProcessingRequest(requestId);
    try {
      // Show processing state in the UI
      showToast("Processing approval...", "info");

      // Call API to approve request USING THE DIRECT METHOD
      const result = await AccessApi.directApproveDriveAccess(requestId);

      // Handle successful response
      if (result.status === "success") {
        showToast(
          "Access request approved and Google Drive access granted",
          "success"
        );
      } else if (result.status === "warning") {
        showToast(result.message, "warning");
      } else {
        showToast(
          result.message || "Request processed with unknown status",
          "info"
        );
      }

      // Update the request in the list to show it's approved
      setAccessRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, status: "approved" as const } : req
        )
      );
    } catch (error: any) {
      console.error("Error approving request:", error);
      showToast(`Failed to approve request: ${error.message}`, "error");
    } finally {
      setProcessingRequest(null);
    }
  };

  const openRejectModal = (request: AccessRequest): void => {
    setSelectedRequest(request);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleRejectRequest = async (): Promise<void> => {
    if (!selectedRequest) return;

    setProcessingRequest(selectedRequest.id);
    try {
      // Show processing state in the UI
      showToast("Processing rejection...", "info");

      // Call API to reject request with optional reason
      await AccessApi.rejectDriveAccess(
        selectedRequest.id,
        rejectReason ? rejectReason : undefined
      );

      // Show success message
      showToast("Access request rejected", "success");

      // Update the request in the list to show it's rejected
      setAccessRequests((prev) =>
        prev.map((req) =>
          req.id === selectedRequest.id
            ? {
                ...req,
                status: "rejected" as const,
                reason: rejectReason || req.reason,
              }
            : req
        )
      );

      setShowRejectModal(false);
    } catch (error: any) {
      console.error("Error rejecting request:", error);
      showToast(`Failed to reject request: ${error.message}`, "error");
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRevokePermission = async (
    permissionId: string
  ): Promise<void> => {
    setPermissionToRevoke(permissionId);
    setShowRevokeConfirmModal(true);
  };

  const renderActivePermissions = (): JSX.Element => (
    <>
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={`px-4 py-2 rounded-md ${
              loadingPermissions
                ? "bg-gray-400 cursor-wait"
                : "bg-[#1E2761] hover:bg-[#1E2761]/80 text-white"
            }`}
            onClick={() => fetchActivePermissions()}
            disabled={loadingPermissions}
          >
            {loadingPermissions ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Loading Permissions...
              </span>
            ) : (
              "Refresh Permissions"
            )}
          </button>

          {/* Auto-sync toggle button */}
          <button
            className={`px-4 py-2 rounded-md flex items-center ${
              autoSyncEnabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-300 hover:bg-gray-400 text-gray-800"
            }`}
            onClick={toggleAutoSync}
          >
            <svg
              className={`w-4 h-4 mr-2 ${
                autoSyncEnabled ? "text-white" : "text-gray-600"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {autoSyncEnabled ? "Auto-Sync: On" : "Auto-Sync: Off"}
          </button>

          {lastSyncTime && (
            <div className="px-4 py-2 text-sm text-gray-500 flex items-center">
              <svg
                className="w-4 h-4 mr-2 text-gray-400"
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
              Last synced: {lastSyncTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {renderErrorMessage()}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {activePermissions.length === 0 ? (
          <div className="text-center py-8">
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <p className="mt-2 text-gray-500">No active permissions found</p>
            <div className="mt-4">
              <button
                onClick={() => fetchActivePermissions()}
                className="px-4 py-2 text-sm bg-[#1E2761] text-white rounded-md hover:bg-[#1E2761]/80"
              >
                Refresh Permissions
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                    Folder
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Role
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Granted By
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Granted At
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
                {activePermissions.map((permission) => (
                  <tr key={permission.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {permission.user_email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {permission.folder_name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                        {permission.folder_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          permission.role === "owner"
                            ? "bg-purple-100 text-purple-800"
                            : permission.role === "writer"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {permission.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {permission.granted_by}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(permission.granted_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleRevokePermission(permission.id)}
                        className="text-[#7A2048] hover:text-[#7A2048]/80 px-2 py-1 rounded hover:bg-[#7A2048]/10"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  const handleSyncGoogleDriveFolders = async (
    silent = false
  ): Promise<void> => {
    if (!isAdmin) return;

    if (!silent) {
      setSyncingFolders(true);
    }

    try {
      const result = await AccessApi.syncGoogleDriveFolders();

      if (!silent) {
        showToast("Successfully synchronized Google Drive folders", "success");
      }

      // Refresh folders
      await fetchFolders(false);

      // Also refresh access requests as they might reference the updated folders
      if (activeTab === "requests") {
        await fetchAccessRequests(undefined, true);
      }

      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Error syncing Google Drive folders:", error);
      if (!silent) {
        showToast("Failed to sync Google Drive folders", "error");
      }
    } finally {
      if (!silent) {
        setSyncingFolders(false);
      }
    }
  };

  const getStatusBadge = (status: string): string => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getSensitivityLabel = (
    sensitivity: string
  ): { label: string; class: string } => {
    switch (sensitivity) {
      case "critical":
        return { label: "Critical", class: "bg-[#7A2048] text-white" };
      case "confidential":
        return {
          label: "Confidential",
          class: "bg-[#7A2048] bg-opacity-80 text-white",
        };
      case "admin":
        return { label: "Admin", class: "bg-[#1E2761] text-white" };
      case "internal":
        return { label: "Internal", class: "bg-[#408EC6] text-white" };
      default:
        return { label: sensitivity, class: "bg-gray-100 text-gray-800" };
    }
  };

  // Function to handle filter changes
  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const { name, value } = e.target;

    // Update the filter state
    setFilter((prev) => ({
      ...prev,
      [name]: value,
    }));

    // If changing status filter, immediately fetch with new status value
    if (name === "status") {
      // Small delay to ensure state is updated
      setTimeout(() => {
        fetchAccessRequests(value);
      }, 0);
    }
  };

  const handleScanDriveFolders = async (): Promise<void> => {
    if (!isAdmin) return;

    setScanningFolders(true);
    try {
      const result = await AccessApi.scanDriveFolders();
      showToast(
        `Successfully scanned ${result.total_folders} folders (${result.updated_count} updated)`,
        "success"
      );

      // Refresh the data
      if (activeTab === "requests") {
        await fetchAccessRequests();
      } else {
        await fetchFolders();
      }
    } catch (err: any) {
      console.error("Error scanning Drive folders:", err);
      showToast(err.message || "Error scanning Drive folders", "error");
    } finally {
      setScanningFolders(false);
    }
  };

  // Apply search filter
  const applySearchFilter = (): void => {
    fetchAccessRequests();
  };

  const toggleAutoSync = () => {
    setAutoSyncEnabled(!autoSyncEnabled);

    // If enabling, immediately sync both
    if (!autoSyncEnabled) {
      if (activeTab === "folders") {
        handleSyncGoogleDriveFolders(true);
      } else {
        handleSyncGmailRequests(true);
      }
    }
  };

  const renderErrorMessage = (): JSX.Element | null => {
    if (!error) return null;

    return (
      <div className="bg-red-50 border-l-4 border-[#7A2048] p-4 mb-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-[#7A2048]"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-[#7A2048]">Error</h3>
            <div className="mt-1 text-sm text-[#7A2048] opacity-80">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleRefreshRequests = async (): Promise<void> => {
    await fetchAccessRequests();
    showToast("Access requests refreshed", "info");
  };

  const renderFolders = (): JSX.Element => (
    <>
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={`px-4 py-2 rounded-md ${
              syncingFolders
                ? "bg-gray-400 cursor-wait"
                : "bg-[#1E2761] hover:bg-[#1E2761]/80 text-white"
            }`}
            onClick={() => handleSyncGoogleDriveFolders()}
            disabled={syncingFolders}
          >
            {syncingFolders ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Syncing Folders...
              </span>
            ) : (
              "Sync Google Drive Folders"
            )}
          </button>

          {/* Auto-sync toggle button */}
          <button
            className={`px-4 py-2 rounded-md flex items-center ${
              autoSyncEnabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-300 hover:bg-gray-400 text-gray-800"
            }`}
            onClick={toggleAutoSync}
          >
            <svg
              className={`w-4 h-4 mr-2 ${
                autoSyncEnabled ? "text-white" : "text-gray-600"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {autoSyncEnabled ? "Auto-Sync: On" : "Auto-Sync: Off"}
          </button>

          {lastSyncTime && (
            <div className="px-4 py-2 text-sm text-gray-500 flex items-center">
              <svg
                className="w-4 h-4 mr-2 text-gray-400"
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
              Last synced: {lastSyncTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {renderErrorMessage()}

      {folders.length === 0 && !loading && !error ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
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
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No folders found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            No Google Drive folders available. Make sure the service account has
            access to your folders.
          </p>
          {isAdmin && (
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#408EC6] hover:bg-[#408EC6]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#408EC6]"
                onClick={() => handleSyncGoogleDriveFolders()}
              >
                <svg
                  className="-ml-1 mr-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
                Sync Folders
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="bg-white rounded-lg shadow-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-[#1E2761] bg-opacity-10 rounded-lg flex items-center justify-center text-[#408EC6]">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="ml-3 text-xl font-medium text-gray-900">
                    {folder.name}
                  </h3>
                </div>

                <div className="mb-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                 ${folder.sensitivityLabel?.class || ""}`}
                  >
                    {folder.sensitivityLabel?.label || folder.sensitivity}
                  </span>
                </div>

                <button
                  onClick={() => handleRequestAccess(folder)}
                  disabled={Boolean(folder.hasPendingRequest)}
                  className={`w-full py-2 px-4 rounded-md ${
                    folder.hasPendingRequest
                      ? "bg-yellow-100 text-yellow-800 cursor-default"
                      : "bg-[#408EC6] hover:bg-[#408EC6]/80 text-white"
                  }`}
                >
                  {folder.hasPendingRequest
                    ? "Request Pending"
                    : "Request Access"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderRequestsFilter = (): JSX.Element => (
    <div className="bg-white p-4 rounded-lg shadow-md mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow">
          <label
            htmlFor="search"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Search
          </label>
          <div className="flex">
            <input
              type="text"
              id="search"
              name="search"
              className="w-full px-3 py-2 border border-gray-300 rounded-l-md focus:ring-[#408EC6] focus:border-[#408EC6]"
              placeholder="Search by user or folder name"
              value={filter.search}
              onChange={handleFilterChange}
              onKeyPress={(e) => {
                if (e.key === "Enter") applySearchFilter();
              }}
            />
            <button
              onClick={applySearchFilter}
              className="px-4 py-2 bg-[#1E2761] text-white rounded-r-md hover:bg-[#1E2761]/80"
            >
              Search
            </button>
          </div>
        </div>
        <div className="md:w-48">
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#408EC6] focus:border-[#408EC6]"
            value={filter.status}
            onChange={handleFilterChange}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="self-end md:self-auto md:flex-shrink-0 md:flex md:items-end md:ml-2">
          <div className="flex gap-2">
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Reset
            </button>
            <button
              onClick={() => fetchAccessRequests()}
              className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/80"
              disabled={loading}
            >
              {loading ? (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                "Refresh"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccessRequests = (): JSX.Element => (
    <>
      {/* Add the sync buttons at the top of the requests tab too */}
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {/* Removed the "Sync Google Drive Folders" button as requested */}

          {/* Only show the Sync Gmail button when auto-sync is OFF */}
          {!autoSyncEnabled && (
            <button
              className={`px-4 py-2 rounded-md ${
                syncingGmail
                  ? "bg-gray-400 cursor-wait"
                  : "bg-[#7A2048] hover:bg-[#7A2048]/80 text-white"
              }`}
              onClick={() => handleSyncGmailRequests()}
              disabled={syncingGmail}
            >
              {syncingGmail ? "Syncing Gmail..." : "Sync Gmail"}
            </button>
          )}

          {/* Auto-sync toggle button */}
          <button
            className={`px-4 py-2 rounded-md flex items-center ${
              autoSyncEnabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-300 hover:bg-gray-400 text-gray-800"
            }`}
            onClick={toggleAutoSync}
          >
            <svg
              className={`w-4 h-4 mr-2 ${
                autoSyncEnabled ? "text-white" : "text-gray-600"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {autoSyncEnabled ? "Auto-Sync: On" : "Auto-Sync: Off"}
          </button>

          <button
            className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800"
            onClick={handleRefreshRequests}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          {lastSyncTime && (
            <div className="px-4 py-2 text-sm text-gray-500 flex items-center">
              <svg
                className="w-4 h-4 mr-2 text-gray-400"
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
              Last synced: {lastSyncTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {renderRequestsFilter()}
      {renderErrorMessage()}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {accessRequests.length === 0 ? (
          <div className="text-center py-8">
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
            <p className="mt-2 text-gray-500">No access requests found</p>
            <div className="mt-4 flex justify-center space-x-4">
              <button
                onClick={handleRefreshRequests}
                className="px-4 py-2 text-sm bg-[#1E2761] text-white rounded-md hover:bg-[#1E2761]/80"
              >
                Refresh Requests
              </button>
              {/* Only show the Sync Gmail button when auto-sync is OFF */}
              {!autoSyncEnabled && (
                <button
                  className={`px-4 py-2 rounded-md text-sm ${
                    syncingGmail
                      ? "bg-gray-400 cursor-wait"
                      : "bg-[#7A2048] hover:bg-[#7A2048]/80 text-white"
                  }`}
                  onClick={() => handleSyncGmailRequests()}
                  disabled={syncingGmail}
                >
                  {syncingGmail ? "Syncing Gmail..." : "Sync Gmail"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                    Folder
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Request Time
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  {/* Add new column for source */}
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Source
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
                {accessRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {request.user_email}
                      </div>
                      <div className="text-xs text-gray-500">
                        {request.device_id
                          ? `Device: ${request.device_id}`
                          : ""}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {request.folder_name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                        {request.folder_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(request.request_time).toLocaleString()}
                      </div>
                      {request.decision_time && (
                        <div className="text-xs text-gray-500">
                          Decision:{" "}
                          {new Date(request.decision_time).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(
                          request.status
                        )}`}
                      >
                        {request.status}
                      </span>
                    </td>
                    {/* New column displaying the source */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {request.source === "drive_api"
                          ? "Google Drive"
                          : request.source === "gmail"
                          ? "Email"
                          : request.source || "Internal"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {request.status === "pending" && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApproveRequest(request.id)}
                            disabled={processingRequest === request.id}
                            className="text-[#408EC6] hover:text-[#408EC6]/80 px-2 py-1 rounded hover:bg-[#408EC6]/10"
                          >
                            {processingRequest === request.id
                              ? "Processing..."
                              : "Approve"}
                          </button>
                          <button
                            onClick={() => openRejectModal(request)}
                            disabled={processingRequest === request.id}
                            className="text-[#7A2048] hover:text-[#7A2048]/80 px-2 py-1 rounded hover:bg-[#7A2048]/10"
                          >
                            {processingRequest === request.id
                              ? "Processing..."
                              : "Reject"}
                          </button>
                        </div>
                      )}
                      {request.status !== "pending" && (
                        <div>
                          {request.reason ? (
                            <span className="text-gray-500">
                              Reason: {request.reason}
                            </span>
                          ) : (
                            <span className="text-gray-500">
                              {request.status === "approved"
                                ? "Approved"
                                : "Rejected"}{" "}
                              by {request.decision_by_email || "admin"}
                              {request.decision_time && <> </>}
                            </span>
                          )}
                          {request.drive_error && (
                            <div className="text-[#7A2048] text-xs mt-1">
                              Error: {request.drive_error}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  // The pendingCount was defined as:
  const pendingCount = accessRequests.filter(
    (req) => req.status === "pending"
  ).length;

  return (
    <div>
      {isAdmin && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === "folders"
                    ? "border-[#408EC6] text-[#408EC6]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setActiveTab("folders")}
              >
                Available Folders
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === "requests"
                    ? "border-[#408EC6] text-[#408EC6]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setActiveTab("requests")}
              >
                Access Requests{" "}
                {pendingCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-[#7A2048] text-white rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === "permissions"
                    ? "border-[#408EC6] text-[#408EC6]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setActiveTab("permissions")}
              >
                Active Permissions
              </button>
            </nav>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#408EC6]"></div>
        </div>
      ) : activeTab === "folders" ? (
        renderFolders()
      ) : activeTab === "requests" ? (
        renderAccessRequests()
      ) : (
        renderActivePermissions()
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          className="fixed z-10 inset-0 overflow-y-auto"
          aria-labelledby="modal-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onClick={() => setShowRejectModal(false)}
            ></div>

            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-[#7A2048]/10 sm:mx-0 sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 text-[#7A2048]"
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
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3
                      className="text-lg leading-6 font-medium text-gray-900"
                      id="modal-title"
                    >
                      Reject Access Request
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to reject this access request from{" "}
                        <strong>{selectedRequest?.user_email}</strong> for
                        folder <strong>{selectedRequest?.folder_name}</strong>?
                        This action cannot be undone.
                      </p>
                      <div className="mt-4">
                        <label
                          htmlFor="reason"
                          className="block text-sm font-medium text-gray-700"
                        >
                          Reason for rejection (optional)
                        </label>
                        <input
                          type="text"
                          name="reason"
                          id="reason"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#7A2048] focus:border-[#7A2048] sm:text-sm"
                          placeholder="Provide a reason for rejection"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#7A2048] text-base font-medium text-white hover:bg-[#7A2048]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A2048] sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleRejectRequest}
                  disabled={processingRequest === selectedRequest?.id}
                >
                  {processingRequest === selectedRequest?.id
                    ? "Processing..."
                    : "Reject"}
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#408EC6] sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Access Modal */}
      {showRequestModal && selectedFolder && (
        <div
          className="fixed z-10 inset-0 overflow-y-auto"
          aria-labelledby="modal-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onClick={() => setShowRequestModal(false)}
            ></div>

            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-[#408EC6]/10 sm:mx-0 sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 text-[#408EC6]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3
                      className="text-lg leading-6 font-medium text-gray-900"
                      id="modal-title"
                    >
                      Request Access to {selectedFolder.name}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 mb-4">
                        Please enter the email address that should receive read
                        access to this folder.
                      </p>

                      <div>
                        <label
                          htmlFor="request-email"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Email Address
                        </label>
                        <input
                          type="email"
                          id="request-email"
                          name="request-email"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6] sm:text-sm"
                          placeholder="email@example.com"
                          value={requestEmail}
                          onChange={(e) => setRequestEmail(e.target.value)}
                        />
                      </div>

                      <div className="mt-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                            ${selectedFolder.sensitivityLabel?.class || ""}`}
                        >
                          {selectedFolder.sensitivityLabel?.label ||
                            selectedFolder.sensitivity}
                        </span>
                        <p className="text-xs text-gray-500 mt-2">
                          Access to this folder is managed based on Zero Trust
                          security principles. All requests are logged and
                          monitored.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#408EC6] text-base font-medium text-white hover:bg-[#408EC6]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#408EC6] sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={submitAccessRequest}
                  disabled={requestingAccess || !requestEmail}
                >
                  {requestingAccess ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#408EC6] sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowRequestModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showRevokeConfirmModal && (
        <div
          className="fixed z-10 inset-0 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
            ></div>
            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3
                      className="text-lg leading-6 font-medium text-gray-900"
                      id="modal-title"
                    >
                      Revoke Permission
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to revoke this permission? This
                        action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#7A2048] text-base font-medium text-white hover:bg-[#7A2048]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A2048] sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={async () => {
                    if (permissionToRevoke) {
                      try {
                        await AccessApi.revokePermission(permissionToRevoke);
                        setActivePermissions((prev) =>
                          prev.filter((p) => p.id !== permissionToRevoke)
                        );
                        showToast("Permission revoked successfully", "success");
                      } catch (error) {
                        console.error("Error revoking permission:", error);
                        showToast("Failed to revoke permission", "error");
                      } finally {
                        setShowRevokeConfirmModal(false);
                        setPermissionToRevoke(null);
                      }
                    }
                  }}
                >
                  Revoke
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#408EC6] sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => {
                    setShowRevokeConfirmModal(false);
                    setPermissionToRevoke(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleDriveManagement;
