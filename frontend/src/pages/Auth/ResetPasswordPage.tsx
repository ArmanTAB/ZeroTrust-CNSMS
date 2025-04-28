// src/pages/Auth/ResetPasswordPage.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import AuthApi from "../../api/auth.api";
import { useToast } from "../../store/ToastContext";

const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formStep, setFormStep] = useState<"code" | "password">("code");
  const [email, setEmail] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string[]>(
    Array(6).fill("")
  );
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [resendDisabled, setResendDisabled] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [resetSuccess, setResetSuccess] = useState<boolean>(false);

  // Create refs for each input field
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, 6);
  }, []);

  // Extract email from location state
  useEffect(() => {
    if (location.state && location.state.email) {
      setEmail(location.state.email);
    }
  }, [location]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && resendDisabled) {
      setResendDisabled(false);
    }
  }, [countdown, resendDisabled]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow numbers
    if (!/^\d*$/.test(value)) return;

    // Update the code array
    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);

    // Auto-focus to next input if value is entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    // Handle backspace to clear current field and focus previous
    if (e.key === "Backspace") {
      if (!verificationCode[index] && index > 0) {
        const newCode = [...verificationCode];
        newCode[index - 1] = "";
        setVerificationCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");

    // Check if pasted data is a 6-digit number
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = [...verificationCode];
      for (let i = 0; i < 6; i++) {
        newCode[i] = pastedData[i];
      }
      setVerificationCode(newCode);

      // Focus the last input
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      showToast("Email is required", "error");
      return;
    }

    const code = verificationCode.join("");
    if (code.length !== 6) {
      showToast("Please enter all 6 digits of the verification code", "error");
      return;
    }

    // Move to password form step instead of verifying the code immediately
    setFormStep("password");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      showToast("Email is required", "error");
      return;
    }

    const code = verificationCode.join("");
    if (code.length !== 6) {
      showToast("Please enter all 6 digits of the verification code", "error");
      return;
    }

    // Check password requirements
    if (password.length < 8) {
      showToast("Password must be at least 8 characters long", "error");
      return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await AuthApi.resetPassword({
        email,
        code,
        new_password: password,
      });

      showToast(result.message, "success");
      setResetSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/login", {
          state: {
            message:
              "Password has been reset successfully. You can now log in with your new password.",
          },
        });
      }, 3000);
    } catch (err: any) {
      console.error("Password reset error:", err);
      showToast(err.message || "Password reset failed", "error");

      // Go back to code entry step if the code was invalid
      if (
        err.message &&
        (err.message.includes("code") || err.message.includes("Code"))
      ) {
        setFormStep("code");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      showToast("Email is required", "error");
      return;
    }

    setResendDisabled(true);
    setCountdown(60); // Disable for 60 seconds

    try {
      const result = await AuthApi.requestPasswordReset(email);
      showToast(result.message, "success");
    } catch (err: any) {
      console.error("Resend error:", err);
      showToast(err.message || "Failed to resend reset code", "error");
      setResendDisabled(false);
      setCountdown(0);
    }
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-green-100 p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                <svg
                  className="h-8 w-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-green-800">
              Password Reset Complete!
            </h2>
            <p className="mt-2 text-green-600">
              Your password has been reset successfully.
            </p>
            <p className="mt-4 text-gray-600">
              Redirecting you to login page...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-8">
            <div className="text-center">
              <div className="flex justify-center">
                <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-md">
                  <svg
                    className="h-8 w-8 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="mt-4 text-3xl font-bold text-white">
                Reset Password
              </h2>
              <p className="mt-2 text-blue-100">
                {formStep === "code"
                  ? "Enter the 6-digit code sent to your email"
                  : "Create a new password for your account"}
              </p>
            </div>
          </div>

          <div className="px-6 py-8">
            {!email ? (
              <div className="text-center">
                <p className="text-red-500 mb-4">
                  No email provided. Please go back to the forgot password page.
                </p>
                <Link
                  to="/forgot-password"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                >
                  Go to Forgot Password
                </Link>
              </div>
            ) : formStep === "code" ? (
              <form onSubmit={handleVerifyCode} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Verification Code
                  </label>
                  <p className="text-sm text-gray-500 mb-4">
                    We sent a code to{" "}
                    <span className="font-semibold">{email}</span>
                  </p>

                  <div className="flex justify-between items-center gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        maxLength={1}
                        className="w-full h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        value={verificationCode[index]}
                        onChange={(e) =>
                          handleInputChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        placeholder="•"
                        aria-label={`Verification code digit ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading || verificationCode.join("").length !== 6}
                    className={`group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-white ${
                      loading || verificationCode.join("").length !== 6
                        ? "bg-blue-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200`}
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                        Verifying...
                      </div>
                    ) : (
                      "Continue"
                    )}
                  </button>
                </div>

                <div className="text-center mt-6">
                  <p className="text-sm text-gray-600">
                    Didn't receive a code?
                  </p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendDisabled}
                    className={`mt-2 text-sm font-medium ${
                      resendDisabled
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-blue-600 hover:text-blue-500"
                    }`}
                  >
                    {resendDisabled
                      ? `Resend code in ${countdown}s`
                      : "Resend reset code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                  >
                    New Password
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400"
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
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                      placeholder="Create a new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-gray-500 focus:outline-none"
                      >
                        {showPassword ? (
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Password must be at least 8 characters long
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Confirm New Password
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400"
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
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      className={`block w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                        confirmPassword && password !== confirmPassword
                          ? "border-red-300"
                          : "border-gray-300"
                      }`}
                      placeholder="Confirm your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      Passwords do not match
                    </p>
                  )}
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setFormStep("code")}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      password.length < 8 ||
                      password !== confirmPassword
                    }
                    className={`flex-1 flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-white ${
                      loading ||
                      password.length < 8 ||
                      password !== confirmPassword
                        ? "bg-blue-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200`}
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                        Resetting...
                      </div>
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
