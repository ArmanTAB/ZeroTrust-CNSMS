// src/pages/Profile/ProfilePage.tsx
import React, { useState, useEffect } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";
import AuthApi from "../../api/auth.api";

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(false);
  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [setupStep, setSetupStep] = useState<"check" | "setup" | "verify">(
    "check"
  );
  const [statusChecked, setStatusChecked] = useState<boolean>(false);

  useEffect(() => {
    // Only check status once when component mounts
    if (!statusChecked) {
      checkTOTPStatus();
    }
  }, [statusChecked]);

  const checkTOTPStatus = async () => {
    try {
      setLoading(true);
      const status = await AuthApi.getTOTPStatus();
      setTotpEnabled(status.totp_enabled);
      setSetupStep(status.totp_enabled ? "check" : "setup");
      setStatusChecked(true); // Mark status as checked
    } catch (error) {
      console.error("Error checking 2FA status:", error);
      showToast("Failed to check 2FA status", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupTOTP = async () => {
    setLoading(true);
    try {
      const response = await AuthApi.setupTOTP();

      if (response && response.data) {
        setSetupData(response.data);
        setSetupStep("verify");
        showToast("TOTP setup initiated", "info");
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      console.error("Error setting up 2FA:", error);
      showToast(error.message || "Failed to setup 2FA", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showToast("Please enter a valid 6-digit code", "error");
      return;
    }

    setLoading(true);
    try {
      await AuthApi.verifyTOTP(verificationCode);
      setTotpEnabled(true);
      setSetupStep("check");
      setSetupData(null);
      setVerificationCode("");
      showToast("Two-factor authentication has been enabled", "success");
    } catch (error: any) {
      console.error("Error verifying 2FA:", error);
      showToast(error.message || "Failed to verify 2FA code", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTOTP = async () => {
    if (
      !window.confirm(
        "Are you sure you want to disable two-factor authentication? This will make your account less secure."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await AuthApi.disableTOTP();
      setTotpEnabled(false);
      setSetupStep("setup");
      showToast("Two-factor authentication has been disabled", "info");
    } catch (error: any) {
      console.error("Error disabling 2FA:", error);
      showToast(error.message || "Failed to disable 2FA", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-4">
            <h1 className="text-xl font-semibold text-white">User Profile</h1>
          </div>

          <div className="p-6">
            <div className="mb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Full Name</p>
                  <p className="font-medium">{user?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Role</p>
                  <p className="font-medium capitalize">
                    {user?.role?.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Member Since</p>
                  <p className="font-medium">
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Two-Factor Authentication
              </h2>

              {loading && statusChecked === false ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mb-2"></div>
                  <p className="text-gray-600">Checking 2FA status...</p>
                </div>
              ) : (
                <>
                  {setupStep === "check" && (
                    <div>
                      <p className="text-sm text-gray-600 mb-4">
                        {totpEnabled
                          ? "Two-factor authentication is currently enabled for your account."
                          : "Two-factor authentication is not enabled. Enable it for additional security."}
                      </p>
                      {totpEnabled ? (
                        <button
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200"
                          onClick={handleDisableTOTP}
                          disabled={loading}
                        >
                          {loading ? "Processing..." : "Disable 2FA"}
                        </button>
                      ) : (
                        <button
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                          onClick={handleSetupTOTP}
                          disabled={loading}
                        >
                          {loading ? "Processing..." : "Enable 2FA"}
                        </button>
                      )}
                    </div>
                  )}

                  {setupStep === "setup" && (
                    <div>
                      <p className="text-sm text-gray-600 mb-4">
                        Set up two-factor authentication to add an extra layer
                        of security to your account.
                      </p>
                      <button
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                        onClick={handleSetupTOTP}
                        disabled={loading}
                      >
                        {loading ? "Processing..." : "Set Up 2FA"}
                      </button>
                    </div>
                  )}

                  {setupStep === "verify" && setupData && (
                    <div>
                      <div className="text-sm text-gray-600 mb-4">
                        <p className="mb-2">
                          Scan this QR code with your authentication app (like
                          Google Authenticator):
                        </p>
                        <div className="flex justify-center my-4">
                          {setupData.qr_code ? (
                            <img
                              src={`data:image/png;base64,${setupData.qr_code}`}
                              alt="QR Code for 2FA"
                              className="border border-gray-300 p-2 rounded"
                              style={{ width: "180px", height: "180px" }}
                            />
                          ) : (
                            <p>QR code loading error. Please try again.</p>
                          )}
                        </div>
                        <p className="mt-2 mb-4">
                          Or enter this code manually:{" "}
                          <code className="bg-gray-100 px-2 py-1 rounded">
                            {setupData.secret}
                          </code>
                        </p>
                        <p>
                          After scanning the QR code or entering the code
                          manually, enter the 6-digit verification code from
                          your authentication app below:
                        </p>
                      </div>

                      <div className="flex space-x-4 mb-4">
                        <input
                          type="text"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter 6-digit code"
                          value={verificationCode}
                          onChange={(e) => {
                            // Only allow numbers and limit to 6 digits
                            const value = e.target.value
                              .replace(/[^0-9]/g, "")
                              .substring(0, 6);
                            setVerificationCode(value);
                          }}
                        />
                        <button
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200"
                          onClick={handleVerifyTOTP}
                          disabled={loading || verificationCode.length !== 6}
                        >
                          {loading ? "Verifying..." : "Verify"}
                        </button>
                      </div>

                      <div>
                        <button
                          className="text-sm text-gray-600 hover:text-gray-900"
                          onClick={() => {
                            setSetupStep("check");
                            setSetupData(null);
                          }}
                        >
                          Cancel Setup
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
