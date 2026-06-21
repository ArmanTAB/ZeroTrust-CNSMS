const { exec } = require("child_process");
const os = require("os");
const logger = require("../main/logger");
const ruleSync = require("./ruleSync");

let _isRunning = false;
let rules = [];
let recentActivities = [];
let monitorInterval;
let currentUser = null;
const MAX_ACTIVITIES = 100;
const CHECK_INTERVAL = 5000;

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

const getRunningProcesses = () => {
  return new Promise((resolve, reject) => {
    let command = "";

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

      let processes = [];

      if (process.platform === "win32") {
        const lines = stdout.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split('","');
          if (parts.length >= 1) {
            const name = parts[0].replace('"', "");
            processes.push({ name });
          }
        }
      } else {
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

const isProcessBlocked = (processName) => {
  if (!processName) return false;

  const activeRules = rules.filter((rule) => {
    const hasApps =
      rule.resources &&
      rule.resources.applications &&
      rule.resources.applications.length > 0;

    if (!hasApps) return false;

    const isActive = ruleSync.isRuleActive(rule);

    const now = new Date();
    logger.debug(
      `Process rule "${rule.name}" (${rule.type}): ` +
        `hasApps=${hasApps}, isActive=${isActive}, ` +
        `current day=${now.getDay()} (${
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()]
        }), ` +
        `current time=${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`
    );

    return isActive;
  });

  // allow rules take priority over block rules
  const allowRules = activeRules.filter((rule) => rule.type === "allow");
  const blockRules = activeRules.filter((rule) => rule.type === "block");

  allowRules.sort((a, b) => b.priority - a.priority);
  blockRules.sort((a, b) => b.priority - a.priority);

  for (const rule of allowRules) {
    for (const allowedApp of rule.resources.applications) {
      if (processMatchesPattern(processName, allowedApp)) {
        logger.debug(`Process ${processName} allowed by rule "${rule.name}"`);
        return false;
      }
    }
  }

  for (const rule of blockRules) {
    for (const blockedApp of rule.resources.applications) {
      if (processMatchesPattern(processName, blockedApp)) {
        logger.debug(`Process ${processName} blocked by rule "${rule.name}"`);
        return true;
      }
    }
  }

  return false;
};

const processMatchesPattern = (processName, pattern) => {
  const processLower = processName.toLowerCase();
  const patternLower = pattern.toLowerCase();
  return (
    processLower.includes(patternLower) ||
    (patternLower.endsWith(".exe") && processLower === patternLower)
  );
};

const killProcess = (processName) => {
  return new Promise((resolve, reject) => {
    let command = "";

    if (process.platform === "win32") {
      command = `taskkill /F /IM "${processName}" /T`;
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

const findRuleForProcess = (processName, type) => {
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

const checkProcesses = async () => {
  if (!_isRunning) return;

  try {
    const processes = await getRunningProcesses();
    logger.debug(`Checking ${processes.length} running processes`);

    for (const process of processes) {
      const isBlocked = isProcessBlocked(process.name);

      if (isBlocked) {
        const blockingRule = findRuleForProcess(process.name, "block");
        const ruleName = blockingRule
          ? blockingRule.ruleName || blockingRule.name
          : "Default rule";

        logger.info(`Blocked process detected: ${process.name} by rule: ${ruleName}`);

        addActivity({
          timestamp: new Date(),
          type: "process",
          resource: process.name,
          blocked: true,
          ruleName: ruleName,
          description: `Blocked and terminated process: ${process.name} (${ruleName})`,
        });

        try {
          await killProcess(process.name);
        } catch (killError) {
          logger.error(`Error terminating process ${process.name}: ${killError.message}`);
        }
      } else {
        const allowRule = findRuleForProcess(process.name, "allow");

        if (allowRule) {
          addActivity({
            timestamp: new Date(),
            type: "process",
            resource: process.name,
            blocked: false,
            ruleName: allowRule.ruleName || allowRule.name,
            description: `Allowed process: ${process.name} (${allowRule.ruleName || allowRule.name})`,
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking processes: ${error.message}`);
  }
};

const start = () => {
  if (_isRunning) {
    logger.info("Process monitoring is already running");
    return;
  }

  monitorInterval = setInterval(checkProcesses, CHECK_INTERVAL);
  _isRunning = true;
  logger.info("Process monitoring started");
  checkProcesses();
};

const stop = () => {
  return new Promise((resolve) => {
    if (!_isRunning) {
      logger.info("Process monitoring is not running");
      resolve(true);
      return;
    }

    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }

    _isRunning = false;
    logger.info("Process monitoring stopped");

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

const updateRules = async (newRules, user, forceUpdate = false) => {
  const wasRunning = _isRunning;
  const oldRules = [...rules];

  if (user) {
    currentUser = user;
  }

  logger.info(
    `Updating process rules: received ${newRules?.length || 0} rules, forceUpdate=${forceUpdate}, monitor running=${wasRunning}`
  );

  const rulesChanged = JSON.stringify(oldRules) !== JSON.stringify(newRules);
  rules = newRules || [];

  const blockApplications = [];
  const allowApplications = [];

  for (const rule of rules) {
    if (rule.isActive && rule.resources && rule.resources.applications) {
      if (rule.type === "block") {
        blockApplications.push(...rule.resources.applications);
      } else if (rule.type === "allow") {
        allowApplications.push(...rule.resources.applications);
      }
    }
  }

  const uniqueBlockApps = [...new Set(blockApplications)];
  const uniqueAllowApps = [...new Set(allowApplications)];

  logger.info(`Applications to be blocked: ${uniqueBlockApps.join(", ") || "none"}`);
  logger.info(`Applications to be allowed: ${uniqueAllowApps.join(", ") || "none"}`);

  if (rulesChanged || forceUpdate) {
    logger.info(
      `Process rules updated: ${rules.length} rules ${wasRunning ? "(monitor continues running)" : "(monitor inactive)"}`
    );

    if (!wasRunning && rules.length > 0) {
      logger.info("Starting process monitor because new rules received");
      start();
    }
  } else {
    logger.info(`Process monitor rules updated: ${rules.length} rules (no changes detected)`);
  }

  return true;
};

const logRuleChanges = (oldRules, newRules) => {
  const oldAppCount = oldRules.reduce((count, rule) => {
    return count + (rule.resources?.applications?.length || 0);
  }, 0);

  const newAppCount = newRules.reduce((count, rule) => {
    return count + (rule.resources?.applications?.length || 0);
  }, 0);

  logger.info(`Rule changes: ${oldRules.length} -> ${newRules.length} rules, ${oldAppCount} -> ${newAppCount} applications`);
};

const addActivity = (activity) => {
  const standardizedActivity = {
    timestamp: activity.timestamp || new Date(),
    type: activity.type || "unknown",
    resource: activity.resource || "",
    blocked: Boolean(activity.blocked),
    ruleName: activity.ruleName || "Unknown Rule",
    description: activity.description || "",
    deviceId: activity.deviceId || os.hostname(),
    userId: activity.userId || (currentUser ? currentUser.id : null),
    user_email: activity.user_email || (currentUser ? currentUser.email : null),
    ip_address: activity.ip_address || getLocalIpAddress(),
  };

  recentActivities.unshift(standardizedActivity);

  if (recentActivities.length > MAX_ACTIVITIES) {
    recentActivities = recentActivities.slice(0, MAX_ACTIVITIES);
  }

  const logLevel = standardizedActivity.blocked ? "info" : "debug";
  logger[logLevel](
    `Activity logged: ${standardizedActivity.type} - ${standardizedActivity.resource} - ` +
      `${standardizedActivity.blocked ? "BLOCKED" : "ALLOWED"} - ` +
      `User: ${standardizedActivity.user_email || standardizedActivity.userId || "unknown"}`
  );
};

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

const getRecentActivities = () => {
  return recentActivities;
};

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
