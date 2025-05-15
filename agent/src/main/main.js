// agent/src/main/main.js - Updated Configuration
const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require("electron");
const path = require("path");
const url = require("url");
const fs = require("fs");
const os = require("os");

// Agent modules
const logger = require("./logger");
const auth = require("../modules/auth");
const networkMonitor = require("../modules/networkMonitor");
const processMonitor = require("../modules/processMonitor");
const fileMonitor = require("../modules/fileMonitor");
const ruleSync = require("../modules/ruleSync");
const settings = require("./settings");

// Global variables
let mainWindow;
let tray;
let isQuitting = false;

// Current user and authentication token
let currentUser = null;
let authToken = null;

// Configuration
const config = {
  apiUrl: "http://localhost:8000/api",
  logLevel: "info",
  updateInterval: 5 * 60 * 1000, // 5 minutes
  appName: "Zero Trust Agent",
  dbName: "zero_trust_db", // Explicitly set database name
  // MongoDB connection URI
  mongoUri:
    process.env.MONGODB_URI ||
    "mongodb+srv://zt_admin:ZZteeGtWYMVPKNaq@cluster0.f2qts.mongodb.net/zero_trust_db?retryWrites=true&w=majority&appName=Cluster0",
};

// Cleanup previous session at startup
const cleanupPreviousSession = async () => {
  logger.info("Checking for and cleaning up previous session");

  try {
    // Check hosts file for our markers
    const hostsPath = networkMonitor.getHostsPath();

    if (fs.existsSync(hostsPath)) {
      const hostsContent = fs.readFileSync(hostsPath, "utf8");

      if (hostsContent.includes("# BEGIN ACCESS CONTROL AGENT BLOCK")) {
        logger.warn("Found previous session blocking rules in hosts file");

        // Remove our block
        const cleanedContent = hostsContent.replace(
          /# BEGIN ACCESS CONTROL AGENT BLOCK\n[\s\S]*?# END ACCESS CONTROL AGENT BLOCK\n/g,
          ""
        );

        fs.writeFileSync(hostsPath, cleanedContent);
        logger.info("Removed previous blocking rules from hosts file");

        // Flush DNS cache
        networkMonitor
          .flushDNSCache()
          .then(() => logger.info("DNS cache flushed after cleanup"))
          .catch((err) =>
            logger.warn(`Error flushing DNS cache: ${err.message}`)
          );
      }
    }
  } catch (error) {
    logger.error(`Error during previous session cleanup: ${error.message}`);
  }
};

// Create application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false, // Don't show window until it's ready
    title: config.appName,
  });

  // Load HTML file
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, "../renderer/login.html"),
      protocol: "file:",
      slashes: true,
    })
  );

  // Show window when fully loaded
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Prevent window closing (minimize to tray)
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  // Actions when window is fully closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Create tray menu
  createTray();
}

// Create tray icon
function createTray() {
  // Tray icon based on OS
  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "../assets/icon.ico")
      : path.join(__dirname, "../assets/icon.png");

  tray = new Tray(iconPath);

  const updateTrayMenu = (isProtectionActive = false) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `${config.appName}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Protection Status",
        submenu: [
          {
            label: `Network Protection: ${
              networkMonitor.isRunning() ? "Active" : "Inactive"
            }`,
            enabled: false,
          },
          {
            label: `Process Protection: ${
              processMonitor.isRunning() ? "Active" : "Inactive"
            }`,
            enabled: false,
          },
          {
            label: `File Protection: ${
              fileMonitor.isRunning() ? "Active" : "Inactive"
            }`,
            enabled: false,
          },
        ],
      },
      { type: "separator" },
      {
        label: isProtectionActive
          ? "Disable Protection (Requires Login)"
          : "Enable Protection (Requires Login)",
        enabled: false,
      },
      { type: "separator" },
      { label: "Show Dashboard", click: showMainWindow },
      { type: "separator" },
      { label: "Quit", click: quitApplication },
    ]);

    tray.setToolTip(
      `${config.appName} - ${
        isProtectionActive ? "Protection Active" : "Protection Inactive"
      }`
    );
    tray.setContextMenu(contextMenu);
  };

  // Initialize tray menu
  updateTrayMenu();

  // Update tray menu every 10 seconds
  setInterval(() => {
    const isActive =
      networkMonitor.isRunning() ||
      processMonitor.isRunning() ||
      fileMonitor.isRunning();
    updateTrayMenu(isActive);
  }, 10000);

  // Show window when clicking on tray icon
  tray.on("click", showMainWindow);
}

// Function to show main window
function showMainWindow() {
  if (mainWindow === null) {
    createWindow();
  } else {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
}

// Function to close application
async function quitApplication() {
  isQuitting = true;

  try {
    // If user is logged in, perform logout procedure
    if (currentUser && authToken) {
      logger.info("Application closing - performing logout cleanup");

      await stopAllMonitors();
    }

    app.quit();
  } catch (error) {
    logger.error(`Error during application quit: ${error.message}`);
    app.quit();
  }
}

// Stop all monitors
async function stopAllMonitors() {
  try {
    logger.info("Stopping all protection modules...");

    // Stop all monitors
    await Promise.all([
      stopMonitorWithPromise(networkMonitor, "Network"),
      stopMonitorWithPromise(processMonitor, "Process"),
      stopMonitorWithPromise(fileMonitor, "File"),
    ]);

    logger.info("All protection modules stopped successfully");
    return true;
  } catch (error) {
    logger.error(`Error stopping protection modules: ${error.message}`);
    return false;
  }
}

// Function to convert monitor stop to Promise
function stopMonitorWithPromise(monitor, monitorName) {
  return new Promise((resolve, reject) => {
    try {
      if (monitor.isRunning()) {
        logger.info(`Stopping ${monitorName} monitor...`);

        if (typeof monitor.stop === "function") {
          // If monitor implements Promise
          if (
            monitor.stop.constructor.name === "AsyncFunction" ||
            monitor.stop.toString().includes("return new Promise")
          ) {
            monitor.stop().then(resolve).catch(reject);
          } else {
            // If not Promise, wrap and check status
            monitor.stop();

            // Check status every 100ms, with timeout of 5 seconds
            let checkCount = 0;
            const maxChecks = 50;

            const checkInterval = setInterval(() => {
              if (!monitor.isRunning()) {
                clearInterval(checkInterval);
                logger.info(`${monitorName} monitor stopped successfully`);
                resolve();
              } else if (checkCount >= maxChecks) {
                clearInterval(checkInterval);
                const error = new Error(
                  `${monitorName} monitor failed to stop within timeout`
                );
                logger.error(error.message);
                reject(error);
              }
              checkCount++;
            }, 100);
          }
        } else {
          reject(
            new Error(`${monitorName} monitor does not implement stop method`)
          );
        }
      } else {
        logger.info(`${monitorName} monitor is already stopped`);
        resolve();
      }
    } catch (error) {
      logger.error(`Error stopping ${monitorName} monitor: ${error.message}`);
      reject(error);
    }
  });
}

// Handle login event
ipcMain.on("login", async (event, credentials) => {
  try {
    logger.info(`Login attempt: ${credentials.email}`);

    // Try standard authentication first
    let result = await auth.login(credentials, config.apiUrl);

    // If standard authentication fails, try direct MongoDB authentication as fallback
    if (!result.success) {
      logger.info(
        `API authentication failed, attempting direct MongoDB authentication`
      );
      result = await auth.authenticateDirectly(credentials, config.mongoUri);
    }

    // In case of successful authentication, save token and user data
    if (result.success) {
      // Save current user data and token
      currentUser = result.user;
      authToken = result.token;

      // Verify that we have a valid user ID
      if (!currentUser || !currentUser.id) {
        logger.error(
          `Missing user ID after successful login: ${JSON.stringify(
            currentUser
          )}`
        );
        event.reply("login-response", {
          success: false,
          error: "Invalid user data received from server. Missing user ID.",
        });
        return;
      }

      logger.info(
        `User logged in successfully: ${currentUser.email} (${currentUser.firstName} ${currentUser.lastName})`
      );
      logger.info(`User ID: ${currentUser.id}`);

      try {
        // Load rules for user - explicitly log the exact user ID being used
        logger.info(`Fetching rules for user ID: ${currentUser.id}`);
        const rules = await ruleSync.getRules(
          currentUser.id,
          authToken,
          config.apiUrl
        );
        logger.info(
          `Loaded ${rules.length} access rules for user ${currentUser.id}`
        );

        // Log rules applicable to the user
        const userSpecificRules = rules.filter((rule) => rule.__userSpecific);

        logger.info(
          `Found ${userSpecificRules.length} rules directly assigned to user ${currentUser.email}`
        );

        // Initialize monitoring modules
        await networkMonitor.init(rules, currentUser);
        await processMonitor.init(rules, currentUser);
        await fileMonitor.init(rules, currentUser);

        // Start monitoring
        networkMonitor.start();
        processMonitor.start();
        fileMonitor.start();

        // Set up periodic rule synchronization - more frequent for quick updates
        const syncInterval = setInterval(() => {
          if (currentUser && authToken) {
            logger.debug("Synchronizing access rules with server...");
            ruleSync
              .getRules(currentUser.id, authToken, config.apiUrl)
              .then((updatedRules) => {
                // Update rules in monitoring modules
                networkMonitor.updateRules(updatedRules, currentUser);
                processMonitor.updateRules(updatedRules, currentUser);
                fileMonitor.updateRules(updatedRules, currentUser);
                logger.info(
                  `Rules synchronized successfully: ${updatedRules.length} rules`
                );

                // Also update the protection status in the UI
                if (mainWindow) {
                  mainWindow.webContents.send("rules-updated", {
                    count: updatedRules.length,
                    timestamp: new Date().toISOString(),
                  });
                }
              })
              .catch((err) => {
                logger.error(`Failed to update rules: ${err.message}`);
                // If error is related to expired token, consider logging out
                if (
                  err.message.includes("Unauthorized") ||
                  err.message.includes("token")
                ) {
                  logger.warn(
                    "Authentication token may have expired. Logging out..."
                  );
                  // Call logout procedure
                  performLogout(event);
                }
              });
          } else {
            // If user is not authenticated, clear interval
            clearInterval(syncInterval);
          }
        }, 30000); // Check every 30 seconds instead of 5 minutes

        // Save interval for possible cleanup on logout
        global.syncInterval = syncInterval;

        // Send logs to server periodically
        const logSyncInterval = setInterval(() => {
          if (currentUser && authToken) {
            const activities = [
              ...networkMonitor.getRecentActivities(),
              ...processMonitor.getRecentActivities(),
              ...fileMonitor.getRecentActivities(),
            ];

            if (activities.length > 0) {
              logger.debug(
                `Sending ${activities.length} activity logs to server...`
              );

              // Format activities for sending to server
              const logsToSend = activities.map((activity) => ({
                userId: currentUser.id,
                type: activity.type,
                resource: activity.resource,
                action: activity.blocked ? "block" : "allow",
                description: activity.description,
                timestamp: activity.timestamp,
              }));

              // Send logs to server
              ruleSync
                .sendActivityLogs(logsToSend, authToken, config.apiUrl)
                .then((result) => {
                  if (result.success) {
                    logger.info(
                      `Successfully sent ${result.count} activity logs to server`
                    );
                  } else {
                    logger.warn(
                      `Failed to send activity logs to server: ${result.error}`
                    );
                  }
                })
                .catch((err) => {
                  logger.error(`Error sending activity logs: ${err.message}`);
                });
            }
          } else {
            // If user is not authenticated, clear interval
            clearInterval(logSyncInterval);
          }
        }, 60000); // Send logs every minute

        // Save interval for possible cleanup on logout
        global.logSyncInterval = logSyncInterval;

        // Load dashboard page, passing full user data
        mainWindow.loadURL(
          url.format({
            pathname: path.join(__dirname, "../renderer/dashboard.html"),
            protocol: "file:",
            slashes: true,
          })
        );

        // Send full user data to renderer after page load
        mainWindow.webContents.once("did-finish-load", () => {
          mainWindow.webContents.send("user-data", currentUser);
        });
      } catch (error) {
        logger.error(`Error initializing protection: ${error.message}`);
        event.reply("login-response", {
          success: false,
          error: `Failed to initialize protection: ${error.message}`,
        });
        return;
      }
    }

    // Send authentication result back to interface
    event.reply("login-response", result);
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    event.reply("login-response", { success: false, error: error.message });
  }
});

// Handle logout event
ipcMain.on("logout", async (event) => {
  await performLogout(event);
});

// Logout function
async function performLogout(event) {
  logger.info("Logout initiated - stopping all protection services");

  try {
    // Stop all monitors
    await stopAllMonitors();

    // Clear rule synchronization interval
    if (global.syncInterval) {
      clearInterval(global.syncInterval);
      global.syncInterval = null;
    }

    // Clear log synchronization interval
    if (global.logSyncInterval) {
      clearInterval(global.logSyncInterval);
      global.logSyncInterval = null;
    }

    // Clear current user data and token
    currentUser = null;
    authToken = null;

    // Disconnect from MongoDB if needed
    if (auth.disconnectFromMongo) {
      await auth.disconnectFromMongo();
    }

    // Load login page
    if (mainWindow) {
      mainWindow.loadURL(
        url.format({
          pathname: path.join(__dirname, "../renderer/login.html"),
          protocol: "file:",
          slashes: true,
        })
      );
    }

    logger.info("User logged out successfully, all monitors stopped");

    // Send response to interface, if event exists
    if (event) {
      event.reply("logout-response", { success: true });
    }

    return true;
  } catch (error) {
    logger.error(`Error during logout: ${error.message}`);

    // Send response to interface, if event exists
    if (event) {
      event.reply("logout-response", {
        success: false,
        error:
          "Failed to completely stop all monitoring services. Please restart the application.",
      });
    }

    // In case of serious error, suggest restarting the application
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Logout Issue",
        message:
          "There was an issue during logout. It's recommended to restart the application.",
        buttons: ["OK"],
      });
    }

    return false;
  }
}

// Handle getting protection status event
ipcMain.on("get-protection-status", (event) => {
  const status = {
    network: networkMonitor.isRunning(),
    process: processMonitor.isRunning(),
    file: fileMonitor.isRunning(),
    user: currentUser
      ? {
          email: currentUser.email,
          name: `${currentUser.firstName} ${currentUser.lastName}`,
          department: currentUser.department,
          role: currentUser.role,
        }
      : null,
  };
  event.reply("protection-status", status);
});

// Handle getting recent activities event
ipcMain.on("get-recent-activities", (event) => {
  const activities = [
    ...networkMonitor.getRecentActivities(),
    ...processMonitor.getRecentActivities(),
    ...fileMonitor.getRecentActivities(),
  ];
  // Sort by time (newest first)
  activities.sort((a, b) => b.timestamp - a.timestamp);
  // Limit to 50 latest events
  event.reply("recent-activities", activities.slice(0, 50));
});

// Handle testing URL blocking
ipcMain.on("check-url", (event, url) => {
  try {
    const domain = networkMonitor.extractDomain(url);
    const isBlocked = networkMonitor.isDomainBlocked
      ? networkMonitor.isDomainBlocked(domain)
      : false;
    const rule = isBlocked
      ? networkMonitor.findRuleForDomain(domain, "block")
      : null;

    event.reply("url-check-result", {
      url: url,
      domain: domain,
      blocked: isBlocked,
      rule: rule ? rule.name : null,
    });
  } catch (error) {
    event.reply("url-check-result", {
      url: url,
      error: error.message,
    });
  }
});

// Handle getting blocking rules
ipcMain.on("get-blocking-rules", (event) => {
  try {
    const blockRules = networkMonitor.getBlockRules
      ? networkMonitor.getBlockRules()
      : [];
    event.reply("blocking-rules", blockRules);
  } catch (error) {
    event.reply("blocking-rules", []);
  }
});

// Manual sending of activity logs to server
ipcMain.on("sync-activity-logs", async (event) => {
  if (!currentUser || !authToken) {
    event.reply("sync-activity-logs-response", {
      success: false,
      error: "Not logged in",
    });
    return;
  }

  try {
    const activities = [
      ...networkMonitor.getRecentActivities(),
      ...processMonitor.getRecentActivities(),
      ...fileMonitor.getRecentActivities(),
    ];

    // Format activities for sending to server
    const logsToSend = activities.map((activity) => ({
      userId: currentUser.id,
      type: activity.type,
      resource: activity.resource,
      action: activity.blocked ? "block" : "allow",
      description: activity.description,
      timestamp: activity.timestamp,
    }));

    // Send logs to server
    const result = await ruleSync.sendActivityLogs(
      logsToSend,
      authToken,
      config.apiUrl
    );

    event.reply("sync-activity-logs-response", {
      success: result.success,
      message: result.success
        ? `Successfully synchronized ${logsToSend.length} activity logs`
        : result.error,
    });
  } catch (error) {
    event.reply("sync-activity-logs-response", {
      success: false,
      error: error.message,
    });
  }
});

// Application startup
app.whenReady().then(async () => {
  // Initialize logging
  logger.init(config.logLevel);
  logger.info("Application started");

  // Initialize settings
  const appSettings = settings.init();

  // Update config with settings
  if (appSettings.mongoUri) {
    config.mongoUri = appSettings.mongoUri;
  }
  if (appSettings.apiUrl) {
    config.apiUrl = appSettings.apiUrl;
  }
  if (appSettings.dbName) {
    config.dbName = appSettings.dbName;
  }

  logger.info(`Using MongoDB URI: ${config.mongoUri}`);
  logger.info(`Using API URL: ${config.apiUrl}`);
  logger.info(`Using database: ${config.dbName}`);

  // Clean up previous session
  await cleanupPreviousSession();

  // Create window
  createWindow();
});

// Exit application when all windows are closed (macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Application activation (macOS)
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Actions before exit
app.on("before-quit", async () => {
  isQuitting = true;

  // If user is logged in, perform logout procedure
  if (currentUser && authToken) {
    logger.info("Application closing - performing logout cleanup");
    await stopAllMonitors();
  }

  logger.info("Application stopped");
});

// Export for use in other files
module.exports = {
  config,
};
