// frontend/src/pages/Agent/AgentUserFormPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AgentApi from "../../api/agent.api";
import { AgentUser, AgentUserRole } from "../../types/agent";
import { useToast } from "../../store/ToastContext";
import MainLayout from "../../components/Layout/MainLayout";

const AgentUserFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Partial<AgentUser>>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: AgentUserRole.USER,
    department: "",
    position: "",
    isActive: true,
  });

  const [loading, setLoading] = useState<boolean>(isEditMode);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode) {
      fetchUser();
    }
  }, [id]);

  const fetchUser = async () => {
    try {
      const userData = await AgentApi.getUserById(id as string);
      if (userData) {
        // Remove password field for edit mode
        const { password, ...userDataWithoutPassword } = userData;
        setFormData(userDataWithoutPassword);
      } else {
        setError("User not found");
      }
    } catch (err) {
      console.error("Error fetching user:", err);
      setError("Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // Handle checkbox inputs
    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setFormData({
        ...formData,
        [name]: target.checked,
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError("Please fill out all required fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email || "")) {
      setError("Please enter a valid email address");
      return;
    }

    // Password validation for new users
    if (!isEditMode && (!formData.password || formData.password.length < 6)) {
      setError("Password must be at least 6 characters long");
      return;
    }

    setSaving(true);

    try {
      if (isEditMode) {
        // If password is empty in edit mode, remove it from the data
        const dataToSubmit = { ...formData };
        if (!dataToSubmit.password) {
          delete dataToSubmit.password;
        }

        await AgentApi.updateUser(id as string, dataToSubmit);
        showToast("User updated successfully", "success");
      } else {
        await AgentApi.createUser(formData);
        showToast("User created successfully", "success");
      }

      // Navigate back to the users list
      navigate("/agent/users");
    } catch (err: any) {
      console.error("Error saving user:", err);
      setError(
        err.message || "An error occurred while saving. Please try again."
      );
      showToast(err.message || "An error occurred while saving", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-[#1E2761] border-opacity-25"></div>
            <div className="w-12 h-12 rounded-full border-t-4 border-[#408EC6] animate-spin absolute top-0"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="flex items-center mb-6">
          <Link
            to="/agent/users"
            className="mr-4 text-[#408EC6] hover:text-[#1E2761]"
          >
            &larr; Back to Users
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditMode ? "Edit Agent User" : "Add Agent User"}
          </h1>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  First Name*
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Last Name*
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email Address*
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {isEditMode
                    ? "Password (leave blank to keep current)"
                    : "Password*"}
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                  required={!isEditMode}
                  minLength={6}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {isEditMode
                    ? "Leave blank to keep the current password"
                    : "Password must be at least 6 characters long"}
                </p>
              </div>

              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Role*
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role || AgentUserRole.USER}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                  required
                >
                  <option value={AgentUserRole.ADMIN}>Admin</option>
                  <option value={AgentUserRole.MANAGER}>Manager</option>
                  <option value={AgentUserRole.USER}>User</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="department"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Department
                </label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  value={formData.department || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                />
              </div>

              <div>
                <label
                  htmlFor="position"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Position
                </label>
                <input
                  type="text"
                  id="position"
                  name="position"
                  value={formData.position || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#408EC6] focus:border-[#408EC6]"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  name="isActive"
                  checked={formData.isActive || false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isActive: e.target.checked,
                    })
                  }
                  className="h-4 w-4 text-[#408EC6] focus:ring-[#408EC6] border-gray-300 rounded"
                />
                <label
                  htmlFor="isActive"
                  className="ml-2 block text-sm text-gray-700"
                >
                  User is active
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-4">
              <Link
                to="/agent/users"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#1E2761] text-white rounded-md hover:bg-[#408EC6] disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
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
                    Saving...
                  </span>
                ) : isEditMode ? (
                  "Update User"
                ) : (
                  "Create User"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default AgentUserFormPage;
