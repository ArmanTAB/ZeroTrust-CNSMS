// src/pages/Profile/ProfilePage.tsx
import React, { useState, useEffect } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";
import AuthApi from "../../api/auth.api";
import { TwoFactorMethod } from "../../types";
import PhoneSetup from "../../components/Auth/PhoneSetup";
import TwilioVerification from "../../components/Auth/TwilioVerification";

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
  const [smsEnabled, setSmsEnabled] = useState<boolean>(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(false);
  const [preferredMethod, setPreferredMethod] = useState<TwoFactorMethod>(
    TwoFactorMethod.NONE
  );
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [showPhoneSetup, setShowPhoneSetup] = useState<boolean>(false);
  const [phoneSetupMethod, setPhoneSetupMethod] = useState<TwoFactorMethod>(
    TwoFactorMethod.SMS
  );
  const [phoneSetupError, setPhoneSetupError] = useState<string | undefined>(
    undefined
  );
  const [verificationStep, setVerificationStep] = useState<"setup" | "verify">(
    "setup"
  );

  useEffect(() => {
    // Only check status once when component mounts
    if (!statusChecked) {
      checkTOTPStatus();
    }
  }, [statusChecked]);

  const checkTOTPStatus = async () => {
    try {
      setLoading(true);
      const status = await AuthApi.get2FAStatus();
      setTotpEnabled(status.totp_enabled);
      setSmsEnabled(status.sms_enabled || false);
      setWhatsappEnabled(status.whatsapp_enabled || false);
      setPreferredMethod(status.preferred_method || TwoFactorMethod.NONE);
      setPhoneNumber(status.phone_number);
      setPhoneVerified(!!status.phone_number);

      setSetupStep(
        status.totp_enabled || status.sms_enabled || status.whatsapp_enabled
          ? "check"
          : "setup"
      );
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

  const handleSetupPhone = async (phone: string, method: TwoFactorMethod) => {
    setLoading(true);
    setPhoneSetupError(undefined);

    try {
      const result = await AuthApi.setupPhoneVerification(phone, method);

      setPhoneNumber(phone);
      setPhoneSetupMethod(method);
      setVerificationStep("verify");
      showToast(`Verification code sent via ${method}`, "info");
    } catch (error: any) {
      console.error("Error setting up phone verification:", error);
      setPhoneSetupError(error.message || "Failed to setup phone verification");
      showToast(error.message || "Failed to setup phone verification", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async (code: string, method: TwoFactorMethod) => {
    if (!phoneNumber) return;

    setLoading(true);
    setPhoneSetupError(undefined);

    try {
      const result = await AuthApi.verifyPhoneNumber(phoneNumber, code, method);

      // Update states based on which method was verified
      if (method === TwoFactorMethod.SMS) {
        setSmsEnabled(true);
      } else if (method === TwoFactorMethod.WHATSAPP) {
        setWhatsappEnabled(true);
      }

      setPreferredMethod(method);
      setPhoneVerified(true);
      setShowPhoneSetup(false);
      setVerificationStep("setup");
      showToast(`Phone verified successfully via ${method}`, "success");

      // Refresh 2FA status
      await checkTOTPStatus();
    } catch (error: any) {
      console.error("Error verifying phone:", error);
      setPhoneSetupError(error.message || "Failed to verify phone");
      showToast(error.message || "Failed to verify phone", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (!phoneSetupMethod || !phoneNumber) return;

    try {
      const result = await AuthApi.setupPhoneVerification(
        phoneNumber,
        phoneSetupMethod
      );
      showToast(`Verification code resent via ${phoneSetupMethod}`, "success");
    } catch (error: any) {
      console.error("Error resending verification code:", error);
      showToast(error.message || "Failed to resend verification code", "error");
    }
  };

  const handleUpdatePreferredMethod = async (method: TwoFactorMethod) => {
    setLoading(true);

    try {
      const result = await AuthApi.updatePreferred2FAMethod(method);
      setPreferredMethod(method);
      showToast(`Preferred 2FA method updated to ${method}`, "success");
    } catch (error: any) {
      console.error("Error updating preferred method:", error);
      showToast(error.message || "Failed to update preferred method", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSMSWhatsApp = async (method: TwoFactorMethod) => {
    if (
      !window.confirm(
        `Are you sure you want to disable ${method} verification?`
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const result = await AuthApi.disable2FAMethod(method);

      if (method === TwoFactorMethod.SMS) {
        setSmsEnabled(false);
      } else if (method === TwoFactorMethod.WHATSAPP) {
        setWhatsappEnabled(false);
      }

      showToast(`${method} verification disabled`, "info");

      // Refresh 2FA status
      await checkTOTPStatus();
    } catch (error: any) {
      console.error(`Error disabling ${method}:`, error);
      showToast(error.message || `Failed to disable ${method}`, "error");
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

            {/* Authenticator App (TOTP) section */}
            <div className="pt-6 border-t border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Authenticator App (TOTP)
              </h2>

              {loading && statusChecked === false ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#1E2761] mb-2"></div>
                  <p className="text-gray-600">Checking 2FA status...</p>
                </div>
              ) : (
                <>
                  {setupStep === "check" && (
                    <div>
                      <p className="text-sm text-gray-600 mb-4">
                        {totpEnabled
                          ? "Authenticator app (TOTP) is currently enabled for your account."
                          : "Authenticator app (TOTP) is not enabled. Enable it for additional security."}
                      </p>
                      {totpEnabled ? (
                        <button
                          className="px-4 py-2 bg-[#7A2048] text-white rounded-md hover:bg-[#7A2048]/90 focus:outline-none focus:ring-2 focus:ring-[#7A2048] transition-colors duration-200"
                          onClick={handleDisableTOTP}
                          disabled={loading}
                        >
                          {loading
                            ? "Processing..."
                            : "Disable Authenticator App"}
                        </button>
                      ) : (
                        <button
                          className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                          onClick={handleSetupTOTP}
                          disabled={loading}
                        >
                          {loading
                            ? "Processing..."
                            : "Enable Authenticator App"}
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
                        className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                        onClick={handleSetupTOTP}
                        disabled={loading}
                      >
                        {loading ? "Processing..." : "Set Up Authenticator App"}
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
                          disabled={loading || verificationCode.length !== 6}
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
                </>
              )}
            </div>

            {/* Phone verification section */}
            <div className="pt-6 border-t border-gray-200 mt-6">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Phone Verification
              </h2>

              {loading && !phoneVerified && !showPhoneSetup ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#1E2761] mb-2"></div>
                  <p className="text-gray-600">
                    Loading phone verification status...
                  </p>
                </div>
              ) : showPhoneSetup ? (
                <>
                  {verificationStep === "setup" ? (
                    <PhoneSetup
                      onSetup={handleSetupPhone}
                      onCancel={() => setShowPhoneSetup(false)}
                      isLoading={loading}
                      error={phoneSetupError}
                    />
                  ) : (
                    <TwilioVerification
                      method={phoneSetupMethod}
                      phoneNumber={phoneNumber}
                      onVerify={handleVerifyPhone}
                      onCancel={() => setVerificationStep("setup")}
                      onResend={handleResendVerificationCode}
                      isLoading={loading}
                      error={phoneSetupError}
                    />
                  )}
                </>
              ) : (
                <div>
                  {phoneVerified ? (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">
                        Phone verification is set up for your account.
                      </p>
                      <div className="bg-gray-50 p-4 rounded-md mb-4">
                        <p className="font-medium">
                          Verified Phone: {phoneNumber}
                        </p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="sms-enabled"
                              className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6]"
                              checked={smsEnabled}
                              disabled
                            />
                            <label
                              htmlFor="sms-enabled"
                              className="ml-2 text-sm text-gray-700"
                            >
                              SMS Verification
                            </label>
                            {smsEnabled && (
                              <button
                                className="ml-2 text-xs text-red-600 hover:text-red-800"
                                onClick={() =>
                                  handleDisableSMSWhatsApp(TwoFactorMethod.SMS)
                                }
                              >
                                Disable
                              </button>
                            )}
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="whatsapp-enabled"
                              className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6]"
                              checked={whatsappEnabled}
                              disabled
                            />
                            <label
                              htmlFor="whatsapp-enabled"
                              className="ml-2 text-sm text-gray-700"
                            >
                              WhatsApp Verification
                            </label>
                            {whatsappEnabled && (
                              <button
                                className="ml-2 text-xs text-red-600 hover:text-red-800"
                                onClick={() =>
                                  handleDisableSMSWhatsApp(
                                    TwoFactorMethod.WHATSAPP
                                  )
                                }
                              >
                                Disable
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Setup buttons for SMS or WhatsApp if not already enabled */}
                      <div className="flex flex-wrap gap-2">
                        {!smsEnabled && (
                          <button
                            onClick={() => {
                              setPhoneSetupMethod(TwoFactorMethod.SMS);
                              setShowPhoneSetup(true);
                            }}
                            className="px-3 py-1 text-sm bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                          >
                            Setup SMS Verification
                          </button>
                        )}
                        {!whatsappEnabled && (
                          <button
                            onClick={() => {
                              setPhoneSetupMethod(TwoFactorMethod.WHATSAPP);
                              setShowPhoneSetup(true);
                            }}
                            className="px-3 py-1 text-sm bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                          >
                            Setup WhatsApp Verification
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-600 mb-4">
                        Phone verification is not set up. Enable it for
                        additional security options.
                      </p>
                      <button
                        className="px-4 py-2 bg-[#408EC6] text-white rounded-md hover:bg-[#408EC6]/90 focus:outline-none focus:ring-2 focus:ring-[#408EC6] transition-colors duration-200"
                        onClick={() => setShowPhoneSetup(true)}
                        disabled={loading}
                      >
                        {loading ? "Processing..." : "Setup Phone Verification"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preferred 2FA method section */}
            {(totpEnabled || smsEnabled || whatsappEnabled) && (
              <div className="pt-6 border-t border-gray-200 mt-6">
                <h2 className="text-lg font-medium text-gray-900 mb-2">
                  Preferred 2FA Method
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Select your preferred two-factor authentication method when
                  logging in.
                </p>

                <div className="space-y-2">
                  {totpEnabled && (
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="totp-preferred"
                        name="preferred-method"
                        className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6]"
                        checked={preferredMethod === TwoFactorMethod.TOTP}
                        onChange={() =>
                          handleUpdatePreferredMethod(TwoFactorMethod.TOTP)
                        }
                      />
                      <label
                        htmlFor="totp-preferred"
                        className="ml-2 text-sm text-gray-700"
                      >
                        Authenticator App (TOTP)
                      </label>
                    </div>
                  )}

                  {smsEnabled && (
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="sms-preferred"
                        name="preferred-method"
                        className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6]"
                        checked={preferredMethod === TwoFactorMethod.SMS}
                        onChange={() =>
                          handleUpdatePreferredMethod(TwoFactorMethod.SMS)
                        }
                      />
                      <label
                        htmlFor="sms-preferred"
                        className="ml-2 text-sm text-gray-700"
                      >
                        SMS
                      </label>
                    </div>
                  )}

                  {whatsappEnabled && (
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="whatsapp-preferred"
                        name="preferred-method"
                        className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6]"
                        checked={preferredMethod === TwoFactorMethod.WHATSAPP}
                        onChange={() =>
                          handleUpdatePreferredMethod(TwoFactorMethod.WHATSAPP)
                        }
                      />
                      <label
                        htmlFor="whatsapp-preferred"
                        className="ml-2 text-sm text-gray-700"
                      >
                        WhatsApp
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Security Tips */}
            <div className="pt-6 border-t border-gray-200 mt-6">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Security Tips
              </h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
                  <li>Use a strong, unique password for your account.</li>
                  <li>
                    Enable at least one form of two-factor authentication.
                  </li>
                  <li>
                    Avoid using public or unsecured networks when accessing
                    sensitive information.
                  </li>
                  <li>
                    Regularly review your account activity for any suspicious
                    behavior.
                  </li>
                  <li>
                    Keep your devices and applications updated with the latest
                    security patches.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
