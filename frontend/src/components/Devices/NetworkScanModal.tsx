// src/components/Devices/NetworkScanModal.tsx
import React, { useState, useEffect } from "react";
import DevicesApi from "../../api/devices.api";
import { useToast } from "../../store/ToastContext";
import { Device, DeviceType } from "../../types";

interface NetworkScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceAdded: () => void;
}

interface FoundDevice {
  device_id: string;
  ip_address: string;
  mac_address: string;
  hostname: string;
  device_type: DeviceType;
  os_type: string;
  is_trusted: boolean;
  system_info: Record<string, any>;
  already_registered: boolean;
  selected?: boolean; // for UI
}

const NetworkScanModal: React.FC<NetworkScanModalProps> = ({
  isOpen,
  onClose,
  onDeviceAdded,
}) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [foundDevices, setFoundDevices] = useState<FoundDevice[]>([]);
  const [addingDevices, setAddingDevices] = useState<boolean>(false);
  const { showToast } = useToast();

  // Reset state when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setFoundDevices([]);
      setIsScanning(false);
    }
  }, [isOpen]);

  const handleStartScan = async () => {
    setIsScanning(true);
    setFoundDevices([]);
    
    try {
      const devices = await DevicesApi.scanNetwork();
      
      // Add selected field for UI
      const devicesWithSelection = devices.map(device => ({
        ...device,
        selected: !device.already_registered // By default, select only new devices
      }));
      
      setFoundDevices(devicesWithSelection);
      showToast(`Found ${devices.length} devices on network`, "info");
    } catch (err: any) {
      console.error("Error scanning network:", err);
      showToast(err.message || "Error scanning network", "error");
    } finally {
      setIsScanning(false);
    }
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setFoundDevices(prevDevices =>
      prevDevices.map(device =>
        device.device_id === deviceId
          ? { ...device, selected: !device.selected }
          : device
      )
    );
  };

  const handleRegisterDevices = async () => {
    const selectedDevices = foundDevices.filter(device => device.selected);
    
    if (selectedDevices.length === 0) {
      showToast("Please select devices to register", "warning");
      return;
    }
    
    setAddingDevices(true);
    
    try {
      let successCount = 0;
      
      for (const device of selectedDevices) {
        try {
          // Remove fields not needed for registration
          const { already_registered, selected, ...deviceData } = device;
          
          await DevicesApi.registerDevice(deviceData);
          successCount++;
        } catch (deviceErr) {
          console.error(`Error registering device ${device.hostname}:`, deviceErr);
        }
      }
      
      if (successCount > 0) {
        showToast(`Successfully registered ${successCount} devices`, "success");
        onDeviceAdded(); // Callback to update the device list
        onClose(); // Close the modal
      } else {
        showToast("Failed to register devices", "error");
      }
    } catch (err: any) {
      console.error("Error registering devices:", err);
      showToast(err.message || "Error registering devices", "error");
    } finally {
      setAddingDevices(false);
    }
  };

  const getDeviceTypeIcon = (deviceType: DeviceType) => {
    switch (deviceType) {
      case DeviceType.WORKSTATION:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
      case DeviceType.LAPTOP:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        );
case DeviceType.SERVER:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
            />
          </svg>
        );
      case DeviceType.MOBILE:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        );
      case DeviceType.IOT:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            />
          </svg>
        );
      case DeviceType.NETWORK:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div
          className="fixed inset-0 bg-black opacity-30"
          onClick={onClose}
        ></div>
        <div className="bg-white rounded-lg shadow-xl z-50 w-full max-w-4xl p-6 relative">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-medium">Network Scan</h3>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={onClose}
              aria-label="Close modal"
              title="Close"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Instructions and scan button */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              Click "Start Scan" to search for devices on your local network. 
              After devices are found, you can select which ones to add to the system.
            </p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 flex items-center"
              onClick={handleStartScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
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
                  Scanning...
                </>
              ) : (
                <>
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Start Scan
                </>
              )}
            </button>
          </div>

          {/* Device list */}
          {foundDevices.length > 0 ? (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium">Found Devices</h4>
                <div className="flex items-center">
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800 mr-4"
                    onClick={() => {
                      setFoundDevices(prevDevices =>
                        prevDevices.map(device => ({ ...device, selected: true }))
                      );
                    }}
                  >
                    Select All
                  </button>
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800"
                    onClick={() => {
                      setFoundDevices(prevDevices =>
                        prevDevices.map(device => ({ ...device, selected: false }))
                      );
                    }}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Select
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Device
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP Address
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MAC Address
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {foundDevices.map((device) => (
                      <tr key={device.device_id} className={`hover:bg-gray-50 ${device.selected ? 'bg-blue-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            checked={device.selected || false}
                            onChange={() => toggleDeviceSelection(device.device_id)}
                            disabled={device.already_registered}
                            aria-label={`Select device ${device.hostname} (${device.ip_address})`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                              {getDeviceTypeIcon(device.device_type)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {device.hostname}
                              </div>
                              <div className="text-sm text-gray-500">
                                {device.os_type}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {device.ip_address}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {device.mac_address}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {device.device_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {device.already_registered ? (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Already Registered
                            </span>
                          ) : (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              New Device
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isScanning ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">Scanning network, please wait...</p>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Click "Start Scan" to search for devices
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 flex items-center"
              onClick={handleRegisterDevices}
              disabled={addingDevices || isScanning || foundDevices.filter(d => d.selected).length === 0}
            >
              {addingDevices ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
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
                  Registering...
                </>
              ) : (
                <>
                  Register Devices ({foundDevices.filter(d => d.selected).length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkScanModal;