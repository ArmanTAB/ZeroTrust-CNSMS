// src/components/GoogleDrive/AccessRequestsSummary.tsx with auto-sync feature

import React, { useState, useEffect, useRef } from "react";
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
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);

  // Ref for tracking interval
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set up auto-sync interval
  useEffect(() => {
    if (autoSyncEnabled) {
      // Set up interval for auto-syncing every 10 seconds
      syncIntervalRef.current = setInterval(() => {
        fetchSummary(true); // silent refresh
      }, 10000);
    }

    // Cleanup interval when component unmounts or auto-sync is disabled
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [autoSyncEnabled]);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await AccessApi.getAccessRequestsSummary();
      setSummary(data);
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Error fetching access requests summary:", error);
      if (!silent) {
        showToast("Failed to load access requests summary", "error");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await AccessApi.directApproveDriveAccess(requestId);
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

  const toggleAutoSync = () => {
    setAutoSyncEnabled(!autoSyncEnabled);
    // If enabling, immediately fetch new data
    if (!autoSyncEnabled) {
      fetchSummary(true);
    }
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-[#1E2761]">
          Access Requests Summary
        </h2>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded-md text-sm flex items-center ${
              autoSyncEnabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-300 hover:bg-gray-400 text-gray-800"
            }`}
            onClick={toggleAutoSync}
          >
            <svg
              className={`w-3 h-3 mr-1 ${
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
            {autoSyncEnabled ? "Auto" : "Manual"}
          </button>
          <button
            onClick={() => fetchSummary()}
            className="px-3 py-1 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/80 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {lastSyncTime && (
        <div className="text-xs text-gray-500 mb-4 flex items-center">
          <svg
            className="w-3 h-3 mr-1 text-gray-400"
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
          Last updated: {lastSyncTime.toLocaleTimeString()}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#1E2761]/5 p-4 rounded-lg">
          <div className="text-[#1E2761] text-xl font-bold">
            {summary.total}
          </div>
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
        <div className="bg-[#7A2048]/5 p-4 rounded-lg">
          <div className="text-[#7A2048] text-xl font-bold">
            {summary.rejected}
          </div>
          <div className="text-sm text-gray-600">Rejected</div>
        </div>
      </div>

      {summary.recent_pending.length > 0 ? (
        <>
          <h3 className="text-lg font-medium mb-3 text-[#1E2761]">
            Recent Pending Requests
          </h3>
          <div className="space-y-3">
            {summary.recent_pending.map((request) => (
              <div
                key={request.id}
                className="border rounded-lg p-3 bg-gray-50 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-[#1E2761]">
                      {request.user_email}
                    </div>
                    <div className="text-sm text-gray-600">
                      {request.folder_name} •{" "}
                      {new Date(request.request_time).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="px-3 py-1 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/80 text-sm transition-colors duration-200"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="px-3 py-1 bg-[#7A2048] text-white rounded-md hover:bg-[#7A2048]/80 text-sm transition-colors duration-200"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center p-6 bg-gray-50 rounded-lg">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No pending requests
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            There are no pending access requests to review at this time.
          </p>
        </div>
      )}

      <div className="mt-4 text-right">
        <button
          onClick={handleViewAll}
          className="text-[#408EC6] hover:text-[#1E2761] text-sm font-medium transition-colors duration-200"
        >
          View All Requests
        </button>
      </div>
    </div>
  );
};

export default AccessRequestsSummary;
