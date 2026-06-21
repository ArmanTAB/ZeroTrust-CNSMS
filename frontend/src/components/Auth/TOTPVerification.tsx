// src/components/Auth/TOTPVerification.tsx
import React, { useState } from "react";

interface TOTPVerificationProps {
  onVerify: (code: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string;
}

const TOTPVerification: React.FC<TOTPVerificationProps> = ({
  onVerify,
  onCancel,
  isLoading,
  error,
}) => {
  const [code, setCode] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      onVerify(code);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md mx-auto">
      <h2 className="text-xl font-bold text-center mb-6">
        Two-Factor Authentication
      </h2>

      <p className="text-sm text-gray-600 mb-4 text-center">
        Please enter the 6-digit verification code from your authentication app
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            htmlFor="totp-code"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Verification Code
          </label>
          <input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) => {
              // Only allow numbers and limit to 6 digits
              const value = e.target.value
                .replace(/[^0-9]/g, "")
                .substring(0, 6);
              setCode(value);
            }}
          />
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
            disabled={isLoading}
          >
            Back
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            disabled={isLoading || code.length !== 6}
          >
            {isLoading ? "Verifying..." : "Verify"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TOTPVerification;
