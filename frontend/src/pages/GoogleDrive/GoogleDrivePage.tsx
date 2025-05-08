// frontend/src/pages/GoogleDrive/GoogleDrivePage.tsx
import React from "react";
import MainLayout from "../../components/Layout/MainLayout";
import GoogleDriveManagement from "../../components/GoogleDrive/GoogleDriveManagement";

const GoogleDrivePage: React.FC = () => {
  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Google Drive Access
        </h1>
        <p className="text-gray-600 mt-1">
          Manage access to departmental Google Drive folders
        </p>
      </div>

      <GoogleDriveManagement />
    </MainLayout>
  );
};

export default GoogleDrivePage;