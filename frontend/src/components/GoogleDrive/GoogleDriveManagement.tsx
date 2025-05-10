// frontend/src/components/GoogleDrive/GoogleDriveManagement.tsx
import React, { useState, useEffect } from "react";
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

const GoogleDriveManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [accessRequesting, setAccessRequesting] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"folders" | "requests">("folders");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(
    null
  );
  const [filter, setFilter] = useState<FilterState>({
    search: "",
    status: "", // Changed from "pending" to empty string for "All"
  });
  const [syncingFolders, setSyncingFolders] = useState<boolean>(false);
  const [syncingShares, setSyncingShares] = useState<boolean>(false);
  const [syncingGmail, setSyncingGmail] = useState<boolean>(false);
  const [scanningFolders, setScanningFolders] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "security_analyst";

  // If user is admin, show the requests tab by default
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("requests");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === "folders") {
      fetchFolders();
    } else {
      // When switching to the requests tab, fetch with current filter status
      fetchAccessRequests();
    }
  }, [activeTab]);

  const fetchFolders = async (): Promise<void> => {
    setLoading(true);
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
    } catch (error) {
      console.error("Error fetching folders:", error);
      setError(
        "Failed to fetch Google Drive folders. Please make sure the service account has access to your Google Drive."
      );
      showToast("Failed to fetch Google Drive folders", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessRequests = async (
    statusOverride?: string
  ): Promise<void> => {
    if (!isAdmin) return;

    setLoading(true);
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
    } catch (error) {
      console.error("Error fetching access requests:", error);
      setError("Failed to fetch access requests");
      showToast("Failed to fetch access requests", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = (): void => {
    setFilter({ search: "", status: "" });
    // Delay fetching until state is set
    setTimeout(() => {
      fetchAccessRequests("");
    }, 0);
  };

  const handleSyncGmailRequests = async (): Promise<void> => {
    if (!isAdmin) return;

    setSyncingGmail(true);
    try {
      const result = await AccessApi.syncGmailShareRequests();
      showToast(
        `Successfully synced ${result.total_found} Gmail requests (${result.new_created} new)`,
        "success"
      );

      // Refresh access requests
      if (activeTab === "requests") {
        await fetchAccessRequests();
      }
    } catch (err: any) {
      console.error("Error syncing Gmail requests:", err);
      showToast(err.message || "Error syncing Gmail requests", "error");
    } finally {
      setSyncingGmail(false);
    }
  };

  const handleSyncShareRequests = async (): Promise<void> => {
    if (!isAdmin) return;

    setSyncingShares(true);
    try {
      const result = await AccessApi.syncGoogleDriveShareRequests();
      showToast(
        `Successfully synced ${result.total_found} share requests (${result.new_created} new)`,
        "success"
      );

      // Refresh access requests
      if (activeTab === "requests") {
        await fetchAccessRequests();
      }
    } catch (err: any) {
      console.error("Error syncing share requests:", err);
      showToast(err.message || "Error syncing share requests", "error");
    } finally {
      setSyncingShares(false);
    }
  };

  const handleRequestAccess = async (
    folderId: string,
    folderName: string
  ): Promise<void> => {
    setAccessRequesting(folderId);
    try {
      const result = await AccessApi.requestGoogleDriveAccess(folderId);

      // Check result status
      if (result.status === "success" && result.access_granted) {
        showToast(
          result.message || "You already have access to this folder",
          "success"
        );
      } else if (result.status === "pending") {
        showToast("Access request submitted and is pending approval", "info");

        // Update folder in state to show pending request
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, hasPendingRequest: true } : f
          )
        );
      } else {
        showToast(result.message || "Request submitted", "info");
      }
    } catch (error) {
      console.error("Error requesting access:", error);
      showToast("Failed to request access", "error");
    } finally {
      setAccessRequesting(null);
    }
  };

  const handleApproveRequest = async (requestId: string): Promise<void> => {
    setProcessingRequest(requestId);
    try {
      const result = await AccessApi.approveDriveAccess(requestId);

      if (result.drive_access_granted) {
        showToast(
          "Access request approved and Google Drive access granted",
          "success"
        );
      } else if (result.drive_error) {
        showToast(
          `Request approved but error granting Drive access: ${result.drive_error}`,
          "warning"
        );
      } else {
        showToast("Access request approved", "success");
      }

      // Update the request in the list
      setAccessRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, status: "approved" as const } : req
        )
      );
    } catch (error) {
      console.error("Error approving request:", error);
      showToast("Failed to approve request", "error");
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
      await AccessApi.rejectDriveAccess(selectedRequest.id, rejectReason);
      showToast("Access request rejected", "success");

      // Update the request in the list
      setAccessRequests((prev) =>
        prev.map((req) =>
          req.id === selectedRequest.id
            ? { ...req, status: "rejected" as const, reason: rejectReason }
            : req
        )
      );

      setShowRejectModal(false);
    } catch (error) {
      console.error("Error rejecting request:", error);
      showToast("Failed to reject request", "error");
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleSyncGoogleDriveFolders = async (): Promise<void> => {
    if (!isAdmin) return;

    setSyncingFolders(true);
    try {
      const result = await AccessApi.syncGoogleDriveFolders();
      showToast("Successfully synchronized Google Drive folders", "success");

      // Refresh folders
      await fetchFolders();

      // Also refresh access requests as they might reference the updated folders
      if (activeTab === "requests") {
        await fetchAccessRequests();
      }
    } catch (error) {
      console.error("Error syncing Google Drive folders:", error);
      showToast("Failed to sync Google Drive folders", "error");
    } finally {
      setSyncingFolders(false);
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
        return { label: "Critical", class: "bg-red-100 text-red-800" };
      case "confidential":
        return {
          label: "Confidential",
          class: "bg-yellow-100 text-yellow-800",
        };
      case "admin":
        return { label: "Admin", class: "bg-purple-100 text-purple-800" };
      case "internal":
        return { label: "Internal", class: "bg-blue-100 text-blue-800" };
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

  const renderErrorMessage = (): JSX.Element | null => {
    if (!error) return null;

    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
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
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-1 text-sm text-red-700">{error}</div>
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
        <div className="mb-4">
          <button
            className={`px-4 py-2 rounded-md ${
              syncingFolders
                ? "bg-gray-400 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
            onClick={handleSyncGoogleDriveFolders}
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
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={handleSyncGoogleDriveFolders}
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
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
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
                  onClick={() => handleRequestAccess(folder.id, folder.name)}
                  disabled={
                    accessRequesting === folder.id ||
                    Boolean(folder.hasPendingRequest)
                  }
                  className={`w-full py-2 px-4 rounded-md ${
                    folder.hasPendingRequest
                      ? "bg-yellow-100 text-yellow-800 cursor-default"
                      : accessRequesting === folder.id
                      ? "bg-blue-400 text-white cursor-wait"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {folder.hasPendingRequest
                    ? "Request Pending"
                    : accessRequesting === folder.id
                    ? "Requesting..."
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
              className="w-full px-3 py-2 border border-gray-300 rounded-l-md"
              placeholder="Search by user or folder name"
              value={filter.search}
              onChange={handleFilterChange}
              onKeyPress={(e) => {
                if (e.key === "Enter") applySearchFilter();
              }}
            />
            <button
              onClick={applySearchFilter}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-r-md hover:bg-gray-200"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
        <div className="mb-4 flex space-x-4">
          <button
            className={`px-4 py-2 rounded-md ${
              syncingFolders
                ? "bg-gray-400 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
            onClick={handleSyncGoogleDriveFolders}
            disabled={syncingFolders}
          >
            {syncingFolders
              ? "Syncing Folders..."
              : "Sync Google Drive Folders"}
          </button>

          <button
            className={`px-4 py-2 rounded-md ${
              syncingShares
                ? "bg-gray-400 cursor-wait"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
            onClick={handleSyncShareRequests}
            disabled={syncingShares}
          >
            {syncingShares
              ? "Syncing Share Requests..."
              : "Sync Share Requests"}
          </button>
          <button
            className={`px-4 py-2 rounded-md ${
              syncingGmail
                ? "bg-gray-400 cursor-wait"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
            onClick={handleSyncGmailRequests}
            disabled={syncingGmail}
          >
            {syncingGmail ? "Syncing Gmail..." : "Sync Gmail"}
          </button>
          <button
            className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800"
            onClick={handleRefreshRequests}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
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
                onClick={handleSyncShareRequests}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                disabled={syncingShares}
              >
                {syncingShares ? "Syncing..." : "Sync Share Requests"}
              </button>
              <button
                onClick={handleRefreshRequests}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Refresh Requests
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  syncingGmail
                    ? "bg-gray-400 cursor-wait"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
                onClick={handleSyncGmailRequests}
                disabled={syncingGmail}
              >
                {syncingGmail ? "Syncing Gmail..." : "Sync Gmail"}
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
                            className="text-green-600 hover:text-green-900 px-2 py-1 rounded hover:bg-green-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openRejectModal(request)}
                            disabled={processingRequest === request.id}
                            className="text-red-600 hover:text-red-900 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Reject
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
                            </span>
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
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setActiveTab("folders")}
              >
                Available Folders
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === "requests"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setActiveTab("requests")}
              >
                Access Requests{" "}
                {pendingCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : activeTab === "folders" ? (
        renderFolders()
      ) : (
        renderAccessRequests()
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
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
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
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleRejectRequest}
                  disabled={processingRequest === selectedRequest?.id}
                >
                  {processingRequest === selectedRequest?.id
                    ? "Rejecting..."
                    : "Reject"}
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowRejectModal(false)}
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
