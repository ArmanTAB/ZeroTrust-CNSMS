const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const logger = require("./logger");

// Update the default configuration with your MongoDB Atlas URI
const DEFAULT_CONFIG = {
  apiUrl: "http://127.0.0.1:8000/api",
  mongoUri: "mongodb+srv://zt_admin:ZZteeGtWYMVPKNaq@cluster0.f2qts.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
  dbName: "zero_trust_db",
  logLevel: "info",
  updateInterval: 5 * 60 * 1000, // 5 minutes
  appName: "Zero Trust Security Agent",
};

// Config file path
let configPath;

/**
 * Initialize settings
 * @returns {Object} - Current settings
 */
const init = () => {
  try {
    // Set config file path based on app data directory
    configPath = path.join(app.getPath("userData"), "agent-config.json");

    logger.info(`Settings manager initialized with config path: ${configPath}`);

    // Create config file with default settings if it doesn't exist
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      logger.info("Created default config file");
      return DEFAULT_CONFIG;
    }

    // Read and parse existing config
    const configData = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configData);

    // Merge with default config to ensure all fields exist
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Save merged config back to file
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));

    logger.info("Loaded configuration from file");
    return mergedConfig;
  } catch (error) {
    logger.error(`Error initializing settings: ${error.message}`);
    return DEFAULT_CONFIG;
  }
};

/**
 * Get all settings
 * @returns {Object} - Current settings
 */
const getSettings = () => {
  try {
    if (!configPath) {
      return DEFAULT_CONFIG;
    }

    const configData = fs.readFileSync(configPath, "utf8");
    return JSON.parse(configData);
  } catch (error) {
    logger.error(`Error getting settings: ${error.message}`);
    return DEFAULT_CONFIG;
  }
};

/**
 * Update settings
 * @param {Object} newSettings - New settings to apply
 * @returns {Object} - Updated settings
 */
const updateSettings = (newSettings) => {
  try {
    if (!configPath) {
      configPath = path.join(app.getPath("userData"), "agent-config.json");
    }

    // Read current settings
    let currentSettings = DEFAULT_CONFIG;

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf8");
      currentSettings = JSON.parse(configData);
    }

    // Merge with new settings
    const updatedSettings = { ...currentSettings, ...newSettings };

    // Save updated settings
    fs.writeFileSync(configPath, JSON.stringify(updatedSettings, null, 2));

    logger.info("Settings updated");
    return updatedSettings;
  } catch (error) {
    logger.error(`Error updating settings: ${error.message}`);
    return getSettings();
  }
};

/**
 * Get a specific setting
 * @param {string} key - Setting key
 * @returns {any} - Setting value
 */
const getSetting = (key) => {
  const settings = getSettings();
  return settings[key];
};

module.exports = {
  init,
  getSettings,
  updateSettings,
  getSetting,
};
