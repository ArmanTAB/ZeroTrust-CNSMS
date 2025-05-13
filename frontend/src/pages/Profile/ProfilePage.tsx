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

  // For TOTP
  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [setupStep, setSetupStep] = useState<"check" | "setup" | "verify">(
    "check"
  );

  // For Email OTP
  const [emailOTPEnabled, setEmailOTPEnabled] = useState<boolean>(false);
  const [emailOTPCode, setEmailOTPCode] = useState<string>("");
  const [emailOTPSetupStep, setEmailOTPSetupStep] = useState<
    "check" | "setup" | "verify"
  >("check");

  const [statusChecked, setStatusChecked] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"authenticator" | "email">(
    "authenticator"
  );

  useEffect(() => {
    // Only check status once when component mounts
    if (!statusChecked) {
      checkTOTPStatus();
      checkEmailOTPStatus();
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
      showToast("Failed to check authenticator app status", "error");
    } finally {
      setLoading(false);
    }
  };

  const checkEmailOTPStatus = async () => {
    try {
      setLoading(true);
      const status = await AuthApi.getEmailOTPStatus();
      setEmailOTPEnabled(status.email_otp_enabled);
      setEmailOTPSetupStep(status.email_otp_enabled ? "check" : "setup");
      setStatusChecked(true); // Mark status as checked
    } catch (error) {
      console.error("Error checking email OTP status:", error);
      showToast("Failed to check email verification status", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupEmailOTP = async () => {
    setLoading(true);
    try {
      await AuthApi.setupEmailOTP();
      setEmailOTPSetupStep("verify");
      showToast("Verification code sent to your email", "info");
    } catch (error: any) {
      console.error("Error setting up email verification:", error);
      showToast(error.message || "Failed to setup email verification", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOTP = async () => {
    if (!emailOTPCode || emailOTPCode.length !== 6) {
      showToast("Please enter a valid 6-digit code", "error");
      return;
    }

    setLoading(true);
    try {
      await AuthApi.verifyEmailOTP(emailOTPCode);
      setEmailOTPEnabled(true);
      setEmailOTPSetupStep("check");
      setEmailOTPCode("");
      showToast("Email verification has been enabled", "success");
    } catch (error: any) {
      console.error("Error verifying email verification:", error);
      showToast(error.message || "Failed to verify email code", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableEmailOTP = async () => {
    if (
      !window.confirm(
        "Are you sure you want to disable email verification? This will make your account less secure."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await AuthApi.disableEmailOTP();
      setEmailOTPEnabled(false);
      setEmailOTPSetupStep("setup");
      showToast("Email verification has been disabled", "info");
    } catch (error: any) {
      console.error("Error disabling email verification:", error);
      showToast(
        error.message || "Failed to disable email verification",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailOTP = async () => {
    setLoading(true);
    try {
      await AuthApi.setupEmailOTP(); // This will send a new code
      showToast("New verification code sent to your email", "success");
    } catch (error: any) {
      console.error("Error resending email verification code:", error);
      showToast(error.message || "Failed to resend verification code", "error");
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
          <div className="bg-gradient-to-r from-[#1E2761] to-[#408EC6] px-6 py-4">
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
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Two-Factor Authentication
              </h2>

              {loading && statusChecked === false ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#1E2761] mb-2"></div>
                  <p className="text-gray-600">Checking 2FA status...</p>
                </div>
              ) : (
                <>
                  {/* Tab Navigation */}
                  <div className="border-b border-gray-200 mb-4">
                    <nav className="-mb-px flex space-x-4">
                      <button
                        onClick={() => setActiveTab("authenticator")}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "authenticator"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        Authenticator App
                      </button>
                      <button
                        onClick={() => setActiveTab("email")}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activeTab === "email"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        Email Verification
                      </button>
                    </nav>
                  </div>

                  {/* Authenticator App Tab */}
                  {activeTab === "authenticator" && (
                    <div>
                      {setupStep === "check" && (
                        <div>
                          <p className="text-sm text-gray-600 mb-4">
                            {totpEnabled
                              ? "Authenticator app is currently enabled for your account."
                              : "Authenticator app is not enabled. Enable it for additional security."}
                          </p>
                          {totpEnabled ? (
                            <button
                              className="px-4 py-2 bg-[#7A2048] text-white rounded-md hover:bg-[#7A2048]/90 focus:outline-none focus:ring-2 focus:ring-[#7A2048] transition-colors duration-200"
                              onClick={handleDisableTOTP}
                              disabled={loading}
                            >
                              {loading
                                ? "Processing..."
                                : "Disable Authenticator"}
                            </button>
                          ) : (
                            <button
                              className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                              onClick={handleSetupTOTP}
                              disabled={loading}
                            >
                              {loading
                                ? "Processing..."
                                : "Enable Authenticator"}
                            </button>
                          )}
                        </div>
                      )}

                      {setupStep === "setup" && (
                        <div>
                          <p className="text-sm text-gray-600 mb-4">
                            Set up two-factor authentication to add an extra
                            layer of security to your account.
                          </p>
                          <button
                            className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                            onClick={handleSetupTOTP}
                            disabled={loading}
                          >
                            {loading ? "Processing..." : "Set Up Authenticator"}
                          </button>
                        </div>
                      )}

                      {setupStep === "verify" && setupData && (
                        <div>
                          <div className="text-sm text-gray-600 mb-4">
                            <p className="mb-2">
                              Scan this QR code with your authentication app
                              (like Google Authenticator):
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
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#408EC6] focus:border-[#408EC6]"
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
                              className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                              onClick={handleVerifyTOTP}
                              disabled={
                                loading || verificationCode.length !== 6
                              }
                            >
                              {loading ? "Verifying..." : "Verify"}
                            </button>
                          </div>

                          <div>
                            <button
                              className="text-sm text-[#1E2761] hover:text-[#408EC6]"
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
                    </div>
                  )}

                  {/* Email Verification Tab */}
                  {activeTab === "email" && (
                    <div>
                      {emailOTPSetupStep === "check" && (
                        <div>
                          <p className="text-sm text-gray-600 mb-4">
                            {emailOTPEnabled
                              ? "Email verification is currently enabled for your account."
                              : "Email verification is not enabled. Enable it as an alternative to authenticator app."}
                          </p>
                          {emailOTPEnabled ? (
                            <button
                              className="px-4 py-2 bg-[#7A2048] text-white rounded-md hover:bg-[#7A2048]/90 focus:outline-none focus:ring-2 focus:ring-[#7A2048] transition-colors duration-200"
                              onClick={handleDisableEmailOTP}
                              disabled={loading}
                            >
                              {loading
                                ? "Processing..."
                                : "Disable Email Verification"}
                            </button>
                          ) : (
                            <button
                              className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                              onClick={handleSetupEmailOTP}
                              disabled={loading}
                            >
                              {loading
                                ? "Processing..."
                                : "Enable Email Verification"}
                            </button>
                          )}
                        </div>
                      )}

                      {emailOTPSetupStep === "setup" && (
                        <div>
                          <p className="text-sm text-gray-600 mb-4">
                            Set up email verification to receive a verification
                            code by email when logging in.
                          </p>
                          <button
                            className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                            onClick={handleSetupEmailOTP}
                            disabled={loading}
                          >
                            {loading
                              ? "Processing..."
                              : "Send Verification Code"}
                          </button>
                        </div>
                      )}

                      {emailOTPSetupStep === "verify" && (
                        <div>
                          <div className="text-sm text-gray-600 mb-4">
                            <p className="mb-4">
                              Please check your email. We've sent a verification
                              code to {user?.email}.
                            </p>
                            <p>
                              Enter the 6-digit verification code below to
                              enable email verification:
                            </p>
                          </div>

                          <div className="flex space-x-4 mb-4">
                            <input
                              type="text"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#408EC6] focus:border-[#408EC6]"
                              placeholder="Enter 6-digit code"
                              value={emailOTPCode}
                              onChange={(e) => {
                                // Only allow numbers and limit to 6 digits
                                const value = e.target.value
                                  .replace(/[^0-9]/g, "")
                                  .substring(0, 6);
                                setEmailOTPCode(value);
                              }}
                            />
                            <button
                              className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                              onClick={handleVerifyEmailOTP}
                              disabled={loading || emailOTPCode.length !== 6}
                            >
                              {loading ? "Verifying..." : "Verify"}
                            </button>
                          </div>

                          <div className="flex items-center space-x-4">
                            <button
                              className="text-sm text-[#1E2761] hover:text-[#408EC6]"
                              onClick={() => {
                                setEmailOTPSetupStep("check");
                                setEmailOTPCode("");
                              }}
                            >
                              Cancel Setup
                            </button>
                            <button
                              className="text-sm text-[#1E2761] hover:text-[#408EC6]"
                              onClick={handleResendEmailOTP}
                              disabled={loading}
                            >
                              Resend Code
                            </button>
                          </div>
                        </div>
                      )}
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
