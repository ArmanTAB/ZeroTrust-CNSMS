// New file: frontend/src/pages/GoogleDrive/GoogleDrivePage.tsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../components/Layout/MainLayout";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";
import AccessApi from "../../api/access.api";
import { AccessType } from "../../types";

const GoogleDrivePage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [folders, setFolders] = useState<any[]>([]);
  const [accessRequesting, setAccessRequesting] = useState<string | null>(null);

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const response = await AccessApi.getGoogleDriveFolders();
      setFolders(response);
    } catch (error) {
      console.error("Error fetching folders:", error);
      showToast("Failed to fetch Google Drive folders", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (folderId: string, folderName: string) => {
    setAccessRequesting(folderId);
    try {
      const result = await AccessApi.requestGoogleDriveAccess(folderId);

      if (result.access_granted) {
        showToast(`Access granted to ${folderName}`, "success");
        // Update folder status in state
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, accessGranted: true } : f
          )
        );

        // Open the folder in a new tab
        window.open(
          `https://drive.google.com/drive/folders/${folderId}`,
          "_blank"
        );
      } else {
        showToast(`Access denied: ${result.reason}`, "error");
      }
    } catch (error: any) {
      console.error("Error requesting access:", error);
      showToast("Failed to request access", "error");
    } finally {
      setAccessRequesting(null);
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Google Drive Access
        </h1>
        <p className="text-gray-600 mt-1">
          Request access to departmental Google Drive folders
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
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
                   ${
                     folder.sensitivity === "critical"
                       ? "bg-red-100 text-red-800"
                       : folder.sensitivity === "confidential"
                       ? "bg-yellow-100 text-yellow-800"
                       : folder.sensitivity === "admin"
                       ? "bg-purple-100 text-purple-800"
                       : "bg-blue-100 text-blue-800"
                   }`}
                  >
                    {folder.sensitivity}
                  </span>
                </div>

                <button
                  onClick={() => handleRequestAccess(folder.id, folder.name)}
                  disabled={
                    accessRequesting === folder.id || folder.accessGranted
                  }
                  className={`w-full py-2 px-4 rounded-md ${
                    folder.accessGranted
                      ? "bg-green-100 text-green-800 cursor-default"
                      : accessRequesting === folder.id
                      ? "bg-blue-400 text-white cursor-wait"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {folder.accessGranted
                    ? "Access Granted"
                    : accessRequesting === folder.id
                    ? "Requesting..."
                    : "Request Access"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
};

export default GoogleDrivePage;
