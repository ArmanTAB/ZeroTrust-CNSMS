const { exec } = require("child_process");
const os = require("os");
const logger = require("../main/logger");
const ruleSync = require("./ruleSync");

// Global variables
let _isRunning = false;
let rules = [];
let recentActivities = [];
let monitorInterval;
let currentUser = null;
const MAX_ACTIVITIES = 100;
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// Initialize process monitor
const init = async (userRules, user) => {
  try {
    rules = userRules || [];
    recentActivities = [];
    currentUser = user;

    logger.info("Process monitor initialized");
    return true;
  } catch (error) {
    logger.error(`Error initializing process monitor: ${error.message}`);
    return false;
  }
};

// Get list of running processes
const getRunningProcesses = () => {
  return new Promise((resolve, reject) => {
    let command = "";

    // Command depends on OS
    if (process.platform === "win32") {
      command = "tasklist /fo csv /nh";
    } else if (process.platform === "darwin") {
      command = "ps -axo comm";
    } else {
      command = "ps -A -o comm";
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      // Parse output depending on OS
      let processes = [];

      if (process.platform === "win32") {
        // Parsing for Windows
        const lines = stdout.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Remove quotes and split by commas
          const parts = line.split('","');
          if (parts.length >= 1) {
            const name = parts[0].replace('"', "");
            processes.push({ name });
          }
        }
      } else {
        // Parsing for Unix-like systems
        const lines = stdout.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          processes.push({ name: line });
        }
      }

      resolve(processes);
    });
  });
};

// Check if process is blocked
const isProcessBlocked = (processName) => {
  if (!processName) return false;

  // Filter rules, applying time restrictions
  const activeRules = rules.filter(
    (rule) =>
      ruleSync.isRuleActive(rule) &&
      rule.resources &&
      rule.resources.applications &&
      rule.resources.applications.length > 0
  );

  // First check allow rules (they have priority)
  const allowRules = activeRules.filter((rule) => rule.type === "allow");
  const blockRules = activeRules.filter((rule) => rule.type === "block");

  // Sort rules by priority (higher value = higher priority)
  allowRules.sort((a, b) => b.priority - a.priority);
  blockRules.sort((a, b) => b.priority - a.priority);

  // Check if application is explicitly allowed
  for (const rule of allowRules) {
    for (const allowedApp of rule.resources.applications) {
      if (processMatchesPattern(processName, allowedApp)) {
        logger.debug(`Process ${processName} allowed by rule "${rule.name}"`);
        return false;
      }
    }
  }

  // Check if application is blocked
  for (const rule of blockRules) {
    for (const blockedApp of rule.resources.applications) {
      if (processMatchesPattern(processName, blockedApp)) {
        logger.debug(`Process ${processName} blocked by rule "${rule.name}"`);
        return true;
      }
    }
  }

  // By default don't block
  return false;
};

// Check if process matches pattern
const processMatchesPattern = (processName, pattern) => {
  // Convert names to lowercase for case-insensitive comparison
  const processLower = processName.toLowerCase();
  const patternLower = pattern.toLowerCase();

  // Check if pattern is contained in process name
  // or if process name matches pattern
  return (
    processLower.includes(patternLower) ||
    (patternLower.endsWith(".exe") && processLower === patternLower)
  );
};

// Terminate process
const killProcess = (processName) => {
  return new Promise((resolve, reject) => {
    let command = "";

    // Command depends on OS
    if (process.platform === "win32") {
      command = `taskkill /F /IM "${processName}" /T`;
    } else if (process.platform === "darwin") {
      command = `pkill -f "${processName}"`;
    } else {
      command = `pkill -f "${processName}"`;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Failed to kill process ${processName}: ${error.message}`);
        reject(error);
        return;
      }

      logger.info(`Process ${processName} terminated`);
      resolve(true);
    });
  });
};

// Find which rule is responsible for blocking/allowing a process
const findRuleForProcess = (processName, type) => {
  // First search in specific rules for this user
  const userRules = rules.filter((r) => r.__userSpecific && r.type === type);
  for (const rule of userRules) {
    if (rule.resources && rule.resources.applications) {
      for (const app of rule.resources.applications) {
        if (processMatchesPattern(processName, app)) {
          return rule;
        }
      }
    }
  }

  // Then search in all rules
  for (const rule of rules) {
    if (rule.type === type && rule.resources && rule.resources.applications) {
      for (const app of rule.resources.applications) {
        if (processMatchesPattern(processName, app)) {
          return rule;
        }
      }
    }
  }

  return null;
};

// Check running processes
const checkProcesses = async () => {
  if (!_isRunning) return;

  try {
    const processes = await getRunningProcesses();
    logger.debug(`Checking ${processes.length} running processes`);

    // Log both allowed and blocked activities
    for (const process of processes) {
      // Check against block rules first
      const isBlocked = isProcessBlocked(process.name);

      if (isBlocked) {
        // Find which rule blocked this process
        const blockingRule = findRuleForProcess(process.name, "block");
        const ruleName = blockingRule
          ? blockingRule.ruleName || blockingRule.name
          : "Default rule";

        // Log and terminate blocked process
        logger.info(
          `Blocked process detected: ${process.name} by rule: ${ruleName}`
        );

        // Add activity
        addActivity({
          timestamp: new Date(),
          type: "process",
          resource: process.name,
          blocked: true,
          ruleName: ruleName,
          description: `Blocked and terminated process: ${process.name} (${ruleName})`,
        });

        // Terminate process
        try {
          await killProcess(process.name);
        } catch (killError) {
          logger.error(
            `Error terminating process ${process.name}: ${killError.message}`
          );
        }
      } else {
        // Check if there's an explicit allow rule for this process
        const allowRule = findRuleForProcess(process.name, "allow");

        if (allowRule) {
          // Log allowed process activity
          addActivity({
            timestamp: new Date(),
            type: "process",
            resource: process.name,
            blocked: false,
            ruleName: allowRule.ruleName || allowRule.name,
            description: `Allowed process: ${process.name} (${
              allowRule.ruleName || allowRule.name
            })`,
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking processes: ${error.message}`);
  }
};

// Start monitor
const start = () => {
  if (_isRunning) {
    logger.info("Process monitoring is already running");
    return;
  }

  // Start periodic process checking
  monitorInterval = setInterval(checkProcesses, CHECK_INTERVAL);

  _isRunning = true;
  logger.info("Process monitoring started");

  // Immediately perform first check
  checkProcesses();
};

// Stop monitor
const stop = () => {
  return new Promise((resolve) => {
    if (!_isRunning) {
      logger.info("Process monitoring is not running");
      resolve(true);
      return;
    }

    // Stop periodic checking
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }

    _isRunning = false;
    logger.info("Process monitoring stopped");

    // Add activity about stopping monitoring
    addActivity({
      timestamp: new Date(),
      type: "process",
      resource: "all processes",
      blocked: false,
      description: "Process monitoring disabled",
    });

    resolve(true);
  });
};

// Update rules
const updateRules = (newRules, user) => {
  rules = newRules || [];

  // Update current user if provided
  if (user) {
    currentUser = user;
  }

  logger.info(`Process monitor rules updated: ${rules.length} rules`);
};

// Add activity to history
const addActivity = (activity) => {
  recentActivities.unshift(activity);
  // Limit number of stored activities
  if (recentActivities.length > MAX_ACTIVITIES) {
    recentActivities = recentActivities.slice(0, MAX_ACTIVITIES);
  }
};

// Get recent activities
const getRecentActivities = () => {
  return recentActivities;
};

// Check if monitor is running
const isRunning = () => {
  return _isRunning;
};

module.exports = {
  init,
  start,
  stop,
  updateRules,
  getRecentActivities,
  isRunning,
};
