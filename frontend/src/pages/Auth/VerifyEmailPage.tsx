// src/pages/Auth/VerifyEmailPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";

const VerifyEmailPage: React.FC = () => {
  const [verificationCode, setVerificationCode] = useState<string[]>(
    Array(6).fill("")
  );
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [resendDisabled, setResendDisabled] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmail, resendVerification, checkVerificationStatus } =
    useAuth();
  const { showToast } = useToast();

  // Create refs for each input field
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, 6);
  }, []);

  // Extract email from location state
  useEffect(() => {
    if (location.state && location.state.email) {
      setEmail(location.state.email);

      // Check if already verified
      const checkVerification = async () => {
        const verified = await checkVerificationStatus(location.state.email);
        if (verified) {
          setIsVerified(true);
        }
      };

      checkVerification();
    }
  }, [location, checkVerificationStatus]);

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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setLoading(true);
    try {
      const result = await verifyEmail(email, code);
      showToast(result.message, "success");
      setIsVerified(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/login", {
          state: {
            message: "Email verified successfully. You can now log in.",
          },
        });
      }, 3000);
    } catch (err: any) {
      console.error("Verification error:", err);
      showToast(err.message || "Verification failed", "error");
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
      const result = await resendVerification(email);
      showToast(result.message, "success");
    } catch (err: any) {
      console.error("Resend error:", err);
      showToast(err.message || "Failed to resend verification code", "error");
      setResendDisabled(false);
      setCountdown(0);
    }
  };

  if (isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-teal-100 p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-teal-500 rounded-full flex items-center justify-center shadow-md">
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
            <h2 className="text-2xl font-bold text-teal-800">
              Email Verified!
            </h2>
            <p className="mt-2 text-teal-600">
              Your email has been successfully verified.
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-400 to-blue-400 px-6 py-8">
            <div className="text-center">
              <div className="flex justify-center">
                <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-md">
                  <svg
                    className="h-8 w-8 text-teal-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="mt-4 text-3xl font-bold text-white">
                Verify Your Email
              </h2>
              <p className="mt-2 text-blue-100">
                Please enter the 6-digit code sent to your email
              </p>
            </div>
          </div>

          <div className="px-6 py-8">
            {!email ? (
              <div className="text-center">
                <p className="text-red-500 mb-4">
                  No email provided. Please go back to registration.
                </p>
                <button
                  onClick={() => navigate("/register")}
                  className="px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-400 text-white rounded-lg shadow-sm hover:from-teal-600 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors duration-200"
                >
                  Go to Registration
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
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
                        className="w-full h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                        value={verificationCode[index]}
                        onChange={(e) =>
                          handleInputChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        placeholder={`•`}
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
                        ? "bg-teal-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-teal-500 to-blue-400 hover:from-teal-600 hover:to-blue-500"
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors duration-200`}
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
                      "Verify Email"
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
                        : "text-teal-600 hover:text-teal-500"
                    }`}
                  >
                    {resendDisabled
                      ? `Resend code in ${countdown}s`
                      : "Resend verification code"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
