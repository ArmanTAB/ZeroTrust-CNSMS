import React, { useState } from "react";
import { TwoFactorMethod } from "../../types";

interface PhoneSetupProps {
  onSetup: (phoneNumber: string, method: TwoFactorMethod) => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string;
}

const PhoneSetup: React.FC<PhoneSetupProps> = ({
  onSetup,
  onCancel,
  isLoading,
  error,
}) => {
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [method, setMethod] = useState<TwoFactorMethod>(TwoFactorMethod.SMS);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber) {
      // Ensure phone number has international format
      let formattedPhone = phoneNumber;
      if (!formattedPhone.startsWith("+")) {
        formattedPhone = `+${formattedPhone}`;
      }
      onSetup(formattedPhone, method);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md mx-auto">
      <h2 className="text-xl font-bold text-center mb-6">
        Set Up Phone Verification
      </h2>

      <p className="text-sm text-gray-600 mb-4 text-center">
        Enter your phone number to receive verification codes via SMS or
        WhatsApp
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            htmlFor="phone-number"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Phone Number (with country code)
          </label>
          <input
            id="phone-number"
            type="tel"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., +12125551234"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Include country code (e.g., +1 for US)
          </p>
        </div>

        <div className="mb-4">
          <label
            htmlFor="verification-method"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Verification Method
          </label>
          <select
            id="verification-method"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={method}
            onChange={(e) => setMethod(e.target.value as TwoFactorMethod)}
          >
            <option value={TwoFactorMethod.SMS}>SMS</option>
            <option value={TwoFactorMethod.WHATSAPP}>WhatsApp</option>
          </select>
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            disabled={isLoading || !phoneNumber}
          >
            {isLoading ? "Setting Up..." : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PhoneSetup;
