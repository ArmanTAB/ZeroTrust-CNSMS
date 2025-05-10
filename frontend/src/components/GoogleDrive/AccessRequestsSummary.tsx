// src/components/GoogleDrive/AccessRequestsSummary.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AccessApi from "../../api/access.api";
import { useToast } from "../../store/ToastContext";

interface RequestSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  recent_pending: any[];
}

const AccessRequestsSummary: React.FC = () => {
  const [summary, setSummary] = useState<RequestSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    recent_pending: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await AccessApi.getAccessRequestsSummary();
      setSummary(data);
    } catch (error) {
      console.error("Error fetching access requests summary:", error);
      showToast("Failed to load access requests summary", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await AccessApi.approveDriveAccess(requestId);
      showToast("Access request approved", "success");
      fetchSummary(); // Refresh the data
    } catch (error) {
      console.error("Error approving request:", error);
      showToast("Failed to approve request", "error");
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await AccessApi.rejectDriveAccess(requestId);
      showToast("Access request rejected", "success");
      fetchSummary(); // Refresh the data
    } catch (error) {
      console.error("Error rejecting request:", error);
      showToast("Failed to reject request", "error");
    }
  };

  const handleViewAll = () => {
    navigate("/google-drive"); // Navigate to the Google Drive page with the requests tab
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded mb-4 w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="h-8 bg-gray-200 rounded mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-600 bg-yellow-100";
      case "approved":
        return "text-green-600 bg-green-100";
      case "rejected":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Access Requests Summary</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-blue-600 text-xl font-bold">{summary.total}</div>
          <div className="text-sm text-gray-600">Total Requests</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-yellow-600 text-xl font-bold">
            {summary.pending}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-green-600 text-xl font-bold">
            {summary.approved}
          </div>
          <div className="text-sm text-gray-600">Approved</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-red-600 text-xl font-bold">
            {summary.rejected}
          </div>
          <div className="text-sm text-gray-600">Rejected</div>
        </div>
      </div>

      {summary.recent_pending.length > 0 && (
        <>
          <h3 className="text-lg font-medium mb-3">Recent Pending Requests</h3>
          <div className="space-y-3">
            {summary.recent_pending.map((request) => (
              <div
                key={request.id}
                className="border rounded-lg p-3 bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{request.user_email}</div>
                    <div className="text-sm text-gray-600">
                      {request.folder_name} •{" "}
                      {new Date(request.request_time).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 text-right">
        <button
          onClick={handleViewAll}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View All Requests
        </button>
      </div>
    </div>
  );
};

export default AccessRequestsSummary;
