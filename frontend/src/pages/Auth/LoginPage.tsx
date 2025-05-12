// src/pages/Auth/LoginPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { useToast } from "../../store/ToastContext";
import AuthApi from "../../api/auth.api";
import TOTPVerification from "../../components/Auth/TOTPVerification";

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New state variables for 2FA
  const [is2FARequired, setIs2FARequired] = useState(false);
  const [totpError, setTotpError] = useState<string | undefined>(undefined);

  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    loginWith2FA,
    isAuthenticated,
    user,
    error,
    loading: authLoading,
  } = useAuth();
  const { showToast } = useToast();

  // Check if there's a redirect location from state or session storage
  useEffect(() => {
    // If already authenticated, redirect to the appropriate page
    if (isAuthenticated && user && !authLoading) {
      // Check if we have a stored redirect path
      const redirectPath = sessionStorage.getItem("redirectAfterLogin");

      if (redirectPath) {
        // Clear the stored path
        sessionStorage.removeItem("redirectAfterLogin");
        navigate(redirectPath);
      } else if (location.state?.from) {
        // Use the from property if available in location state
        navigate(location.state.from);
      } else {
        // Default to dashboard
        navigate("/dashboard");
      }
    }
  }, [isAuthenticated, user, authLoading, navigate, location.state]);

  // Check for message in location state (e.g., after successful registration)
  useEffect(() => {
    if (location.state && location.state.message) {
      showToast(location.state.message, "success");
      // Clear the state so message doesn't show again on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      // First, check if 2FA is required
      const checkResult = await AuthApi.check2FARequired(email, password);

      if (checkResult.totp_required) {
        // If 2FA is required, show the verification screen
        setIs2FARequired(true);
        setLoading(false);
        return;
      }

      // If 2FA is not required, proceed with normal login
      await login(email, password);
      showToast("You have successfully logged in!", "success");
    } catch (err: any) {
      console.error("Login error:", err);

      // Handle verification error
      if (err.message && err.message.includes("Email not verified")) {
        showToast(
          "Your email is not verified. Please verify your email before logging in.",
          "error"
        );
        // Redirect to verification page
        navigate("/verify-email", {
          state: {
            email: email,
          },
        });
        return;
      }

      // Set error message to display on the form
      setErrorMessage(
        err.message || "Login failed. Please check your credentials."
      );

      showToast(
        err.message || "Login failed. Please check your credentials.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // Handler for 2FA verification
  const handleTOTPVerification = async (code: string) => {
    setLoading(true);
    setTotpError(undefined);

    try {
      // Login with 2FA
      await loginWith2FA(email, password, code);
      showToast("You have successfully logged in!", "success");

      // Navigation will be handled by the useEffect hook
    } catch (err: any) {
      console.error("2FA verification error:", err);
      setTotpError(err.message || "Invalid verification code");
      showToast(err.message || "Invalid verification code", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handler to go back to the login screen from 2FA
  const handleCancelTOTP = () => {
    setIs2FARequired(false);
    setTotpError(undefined);
  };

  // If we're still checking authentication status, show a loading indicator
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Only render the login form if not authenticated
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
          <p className="mt-4 text-gray-600">
            You are already logged in. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  // Show 2FA verification screen if required
  if (is2FARequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
        <TOTPVerification
          onVerify={handleTOTPVerification}
          onCancel={handleCancelTOTP}
          isLoading={loading}
          error={totpError}
        />
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
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="mt-4 text-3xl font-bold text-white">
                Welcome Back
              </h2>
              <p className="mt-2 text-blue-100">
                Sign in to your Zero Trust Security account
              </p>
            </div>
          </div>

          <div className="px-6 py-8">
            {errorMessage && (
              <div
                className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative"
                role="alert"
              >
                <span className="block sm:inline">{errorMessage}</span>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email Address
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
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                      />
                    </svg>
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
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
                    autoComplete="current-password"
                    required
                    className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 transition-all duration-200"
                    placeholder="Enter your password"
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
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
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
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 block text-sm text-gray-700"
                  >
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link
                    to="/forgot-password"
                    className="font-medium text-teal-600 hover:text-teal-500"
                  >
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-white ${
                    loading
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
                      Signing in...
                    </div>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </div>
            </form>

            <div className="mt-8 text-center">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Don't have an account?
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  to="/register"
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors duration-200"
                >
                  Create a new account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
