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
  reason?: string;
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
    status: "pending",
  });
  const [syncingFolders, setSyncingFolders] = useState<boolean>(false);

  const isAdmin = user?.role === "admin" || user?.role === "security_analyst";

  useEffect(() => {
    if (activeTab === "folders") {
      fetchFolders();
    } else {
      fetchAccessRequests();
    }
  }, [activeTab, filter.status]);

  const fetchFolders = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await AccessApi.getGoogleDriveFolders();

      // For each folder, check if there are pending requests
      const folderWithStatus = await Promise.all(
        response.map(async (folder: Folder) => {
          const requests = await AccessApi.checkUserAccessRequests(folder.id);
          return {
            ...folder,
            hasPendingRequest: requests.length > 0,
            sensitivityLabel: getSensitivityLabel(folder.sensitivity),
          };
        })
      );

      setFolders(folderWithStatus);
    } catch (error) {
      console.error("Error fetching folders:", error);
      showToast("Failed to fetch Google Drive folders", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessRequests = async (): Promise<void> => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      console.log("Fetching access requests with status:", filter.status);
      const requests = await AccessApi.getDriveAccessRequests(filter.status);
      console.log("Retrieved requests:", requests); // Debug log

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
      showToast("Failed to fetch access requests", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (
    folderId: string,
    folderName: string
  ): Promise<void> => {
    setAccessRequesting(folderId);
    try {
      const result = await AccessApi.requestGoogleDriveAccess(folderId);

      // Check if access was directly granted (if user already has access)
      if (result.access_granted) {
        showToast(
          result.reason || "You already have access to this folder",
          "success"
        );
      } else {
        showToast("Access request submitted and is pending approval", "info");
      }

      // Update folder in state to show pending request
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, hasPendingRequest: !result.access_granted }
            : f
        )
      );
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
            ? { ...req, status: "rejected" as const }
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
      await AccessApi.syncGoogleDriveFolders();
      showToast("Successfully synchronized Google Drive folders", "success");
      // Refresh folders
      await fetchFolders();
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
    setFilter((prev) => ({
      ...prev,
      [name]: value,
    }));
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
          <input
            type="text"
            id="search"
            name="search"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Search by user or folder name"
            value={filter.search}
            onChange={handleFilterChange}
          />
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
        <div className="self-end md:self-auto md:flex-shrink-0 md:mt-7">
          <button
            onClick={() => {
              setFilter({ search: "", status: "pending" });
              fetchAccessRequests();
            }}
            className="w-full md:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );

  const renderAccessRequests = (): JSX.Element => (
    <>
      {renderRequestsFilter()}

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
                        Device: {request.device_id || "Unknown"}
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
                      {request.status !== "pending" && request.reason && (
                        <span className="text-gray-500">{request.reason}</span>
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
                Access Requests
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
                        Are you sure you want to reject this access request?
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
