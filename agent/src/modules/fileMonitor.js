const fs = require("fs");
const path = require("path");
const os = require("os");
const logger = require("../main/logger");
const ruleSync = require("./ruleSync");

// Global variables
let _isRunning = false;
let rules = [];
let recentActivities = [];
let watchedPaths = new Map(); // Path -> watcher
let currentUser = null;
const MAX_ACTIVITIES = 100;

// Initialize file system monitor
const init = async (userRules, user) => {
  try {
    rules = userRules || [];
    recentActivities = [];
    currentUser = user;

    logger.info("File monitor initialized");
    return true;
  } catch (error) {
    logger.error(`Error initializing file monitor: ${error.message}`);
    return false;
  }
};

// Check if file/folder access is blocked
const isFileAccessBlocked = (filePath) => {
  if (!filePath) return false;

  // Normalize path
  const normalizedPath = path.normalize(filePath);

  // Filter rules, applying time restrictions
  const activeRules = rules.filter(
    (rule) =>
      ruleSync.isRuleActive(rule) &&
      rule.resources &&
      rule.resources.files &&
      rule.resources.files.length > 0
  );

  // Check allow rules first (they have priority)
  const allowRules = activeRules.filter((rule) => rule.type === "allow");
  const blockRules = activeRules.filter((rule) => rule.type === "block");

  // Sort rules by priority (higher value = higher priority)
  allowRules.sort((a, b) => b.priority - a.priority);
  blockRules.sort((a, b) => b.priority - a.priority);

  // Check if file/folder is explicitly allowed
  for (const rule of allowRules) {
    for (const allowedPath of rule.resources.files) {
      const normalizedAllowedPath = path.normalize(allowedPath);

      // If path starts with allowed path, access is allowed
      if (normalizedPath.startsWith(normalizedAllowedPath)) {
        logger.debug(`File access allowed by rule "${rule.name}": ${filePath}`);
        return false;
      }
    }
  }

  // Check if file/folder is blocked
  for (const rule of blockRules) {
    for (const blockedPath of rule.resources.files) {
      const normalizedBlockedPath = path.normalize(blockedPath);

      // If path starts with blocked path, access is blocked
      if (normalizedPath.startsWith(normalizedBlockedPath)) {
        logger.debug(`File access blocked by rule "${rule.name}": ${filePath}`);
        return true;
      }
    }
  }

  // Default: don't block
  return false;
};

// Find which rule is responsible for blocking/allowing a file
const findRuleForFile = (filePath, type) => {
  // First search in specific rules for this user
  const userRules = rules.filter((r) => r.__userSpecific && r.type === type);
  for (const rule of userRules) {
    if (rule.resources && rule.resources.files) {
      for (const p of rule.resources.files) {
        const normalizedPath = path.normalize(p);
        if (filePath.startsWith(normalizedPath)) {
          return rule;
        }
      }
    }
  }

  // Then search in all rules
  for (const rule of rules) {
    if (rule.type === type && rule.resources && rule.resources.files) {
      for (const p of rule.resources.files) {
        const normalizedPath = path.normalize(p);
        if (filePath.startsWith(normalizedPath)) {
          return rule;
        }
      }
    }
  }

  return null;
};

// Create watcher for file/folder
const createWatcher = (dirPath) => {
  try {
    // Check if path exists
    if (!fs.existsSync(dirPath)) {
      logger.warn(`Path does not exist: ${dirPath}`);
      return null;
    }

    // Check if path is a directory
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      logger.warn(`Path is not a directory: ${dirPath}`);
      return null;
    }

    logger.debug(`Starting file watcher for directory: ${dirPath}`);

    // Create watcher
    const watcher = fs.watch(
      dirPath,
      { recursive: true },
      (eventType, filename) => {
        if (!filename || !_isRunning) return;

        const fullPath = path.join(dirPath, filename);
        logger.debug(`File event detected: ${eventType} - ${fullPath}`);

        // Check for both allow and block rules
        const isBlocked = isFileAccessBlocked(fullPath);

        if (isBlocked) {
          // Find which rule blocked this file
          const blockingRule = findRuleForFile(fullPath, "block");
          const ruleName = blockingRule
            ? blockingRule.ruleName || blockingRule.name
            : "Default rule";

          // Log blocked access
          logger.info(
            `Blocked file access detected: ${fullPath} by rule: ${ruleName}`
          );

          // Add activity
          addActivity({
            timestamp: new Date(),
            type: "file",
            resource: fullPath,
            blocked: true,
            ruleName: ruleName,
            description: `Blocked file access: ${fullPath} (${ruleName})`,
          });
        } else {
          // Check if there's an explicit allow rule for this file
          const allowRule = findRuleForFile(fullPath, "allow");

          if (allowRule) {
            // Log allowed file activity
            addActivity({
              timestamp: new Date(),
              type: "file",
              resource: fullPath,
              blocked: false,
              ruleName: allowRule.ruleName || allowRule.name,
              description: `Allowed file access: ${fullPath} (${
                allowRule.ruleName || allowRule.name
              })`,
            });
          }
        }
      }
    );

    logger.info(`Watching directory: ${dirPath}`);
    return watcher;
  } catch (error) {
    logger.error(`Error watching directory ${dirPath}: ${error.message}`);
    return null;
  }
};

// Get list of critical directories
const getCriticalDirectories = () => {
  const criticalDirs = new Set();

  // Add directories from rules
  for (const rule of rules) {
    if (rule.resources && rule.resources.files) {
      for (const filePath of rule.resources.files) {
        // If it's an existing directory, add it
        try {
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
              criticalDirs.add(filePath);
            } else {
              // If it's a file, add its directory
              criticalDirs.add(path.dirname(filePath));
            }
          } else {
            // If path doesn't exist, add its directory
            criticalDirs.add(path.dirname(filePath));
          }
        } catch (error) {
          logger.warn(`Error checking path ${filePath}: ${error.message}`);
        }
      }
    }
  }

  // Add common critical directories
  if (process.platform === "win32") {
    criticalDirs.add("C:\\Windows");
    criticalDirs.add("C:\\Program Files");
    criticalDirs.add("C:\\Program Files (x86)");
    criticalDirs.add(process.env.USERPROFILE || "C:\\Users\\Default");
    criticalDirs.add(
      process.env.APPDATA ||
        path.join(
          process.env.USERPROFILE || "C:\\Users\\Default",
          "AppData",
          "Roaming"
        )
    );
  } else {
    criticalDirs.add("/etc");
    criticalDirs.add("/var");
    criticalDirs.add("/usr");
    criticalDirs.add(process.env.HOME || "/home");
    criticalDirs.add("/opt");
  }

  return Array.from(criticalDirs);
};

// Start monitoring critical directories
const watchCriticalDirectories = () => {
  const criticalDirs = getCriticalDirectories();

  logger.info(`Starting to watch ${criticalDirs.length} critical directories`);

  // Create watchers for each directory
  for (const dir of criticalDirs) {
    const watcher = createWatcher(dir);
    if (watcher) {
      watchedPaths.set(dir, watcher);
    }
  }

  logger.info(`Successfully watching ${watchedPaths.size} directories`);
};

// Start monitoring
const start = () => {
  if (_isRunning) {
    logger.info("File monitoring is already running");
    return;
  }

  // Start watching critical directories
  watchCriticalDirectories();

  _isRunning = true;
  logger.info("File monitoring started");
};

// Stop monitoring
const stop = () => {
  return new Promise((resolve) => {
    if (!_isRunning) {
      logger.info("File monitoring is not running");
      resolve(true);
      return;
    }

    // Stop all watchers
    for (const [dir, watcher] of watchedPaths.entries()) {
      try {
        watcher.close();
        logger.debug(`Stopped watching: ${dir}`);
      } catch (error) {
        logger.warn(`Error closing watcher for ${dir}: ${error.message}`);
      }
    }

    // Clear watchers map
    watchedPaths.clear();

    _isRunning = false;
    logger.info("File monitoring stopped");

    // Add activity about stopping monitoring
    addActivity({
      timestamp: new Date(),
      type: "file",
      resource: "all files",
      blocked: false,
      description: "File monitoring disabled",
    });

    resolve(true);
  });
};

// Update rules
const updateRules = (newRules, user) => {
  const wasRunning = _isRunning;

  // Update current user if provided
  if (user) {
    currentUser = user;
  }

  // If monitor is running, stop it before updating rules
  if (wasRunning) {
    stop().then(() => {
      rules = newRules || [];
      logger.info(`File monitor rules updated: ${rules.length} rules`);

      // Restart monitor with new rules
      start();
    });
  } else {
    rules = newRules || [];
    logger.info(`File monitor rules updated: ${rules.length} rules`);
  }
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
