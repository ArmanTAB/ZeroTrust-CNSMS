// frontend/src/pages/GoogleDrive/GoogleDrivePage.tsx
import React from "react";
import MainLayout from "../../components/Layout/MainLayout";
import GoogleDriveManagement from "../../components/GoogleDrive/GoogleDriveManagement";

const GoogleDrivePage: React.FC = () => {
  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Google Drive Access
            </h1>
            <p className="text-gray-600 mt-1">
              Manage access to departmental Google Drive folders
            </p>
          </div>
          <div className="mt-4 sm:mt-0 px-4 py-2 bg-[#1E2761] text-white rounded-lg shadow-sm inline-block">
            <span className="flex items-center">
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Zero Trust Access Control
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 bg-[#408EC6] rounded-md p-2">
            <svg
              className="h-6 w-6 text-white"
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
          </div>
          <div className="ml-4">
            <h2 className="text-lg font-medium text-[#1E2761]">
              About Zero Trust Google Drive Access
            </h2>
            <p className="text-gray-600 mt-1">
              This page allows you to request and manage access to protected
              Google Drive folders using Zero Trust security principles. All
              access is granted on a least-privilege, time-limited basis with
              continuous verification.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center mb-2">
              <div className="w-8 h-8 rounded-full bg-[#1E2761] flex items-center justify-center text-white font-bold">
                1
              </div>
              <h3 className="ml-2 font-medium text-gray-800">Request Access</h3>
            </div>
            <p className="text-sm text-gray-600">
              Browse available folders and request access based on your work
              requirements.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center mb-2">
              <div className="w-8 h-8 rounded-full bg-[#408EC6] flex items-center justify-center text-white font-bold">
                2
              </div>
              <h3 className="ml-2 font-medium text-gray-800">
                Approval Process
              </h3>
            </div>
            <p className="text-sm text-gray-600">
              Requests are evaluated based on security policies and data
              sensitivity.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center mb-2">
              <div className="w-8 h-8 rounded-full bg-[#7A2048] flex items-center justify-center text-white font-bold">
                3
              </div>
              <h3 className="ml-2 font-medium text-gray-800">Secure Access</h3>
            </div>
            <p className="text-sm text-gray-600">
              Once approved, access is granted with continuous monitoring for
              security.
            </p>
          </div>
        </div>
      </div>

      <GoogleDriveManagement />
    </MainLayout>
  );
};

export default GoogleDrivePage;
