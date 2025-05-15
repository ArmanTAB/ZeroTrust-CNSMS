const flushDNSCache = () => {
  return new Promise((resolve, reject) => {
    let command = "";

    switch (os.platform()) {
      case "win32":
        command = "ipconfig /flushdns";
        break;
      case "darwin":
        command = "dscacheutil -flushcache; killall -HUP mDNSResponder";
        break;
      case "linux":
        command =
          "systemd-resolve --flush-caches || service nscd restart || systemctl restart nscd";
        break;
      default:
        logger.warn(
          `Unsupported platform for DNS cache flushing: ${os.platform()}`
        );
        resolve();
        return;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.warn(`Error flushing DNS cache: ${error.message}`);
      } else {
        logger.info("DNS cache flushed");
      }
      resolve();
    });
  });
};

// Start monitoring
const start = () => {
  if (_isRunning) {
    logger.info("Network monitoring is already running");
    return;
  }

  // Update domain lists before starting
  updateBlockedAndAllowedDomains();

  // Update hosts file only if there are domains to block
  if (blockedDomains.length > 0) {
    updateHostsFile().then((success) => {
      if (success) {
        _isRunning = true;
        logger.info("Network monitoring started");
      } else {
        logger.error(
          "Failed to start network monitoring due to hosts file update error"
        );
      }
    });
  } else {
    // If no domains to block, just mark as running
    _isRunning = true;
    logger.info("Network monitoring started (no domains to block)");
  }
};

// Stop monitoring
const stop = () => {
  return new Promise(async (resolve, reject) => {
    if (!_isRunning) {
      logger.info("Network monitoring is not running");
      resolve(true);
      return;
    }

    try {
      // Restore original hosts file
      const success = await restoreHostsFile();

      if (success) {
        _isRunning = false;
        logger.info("Network monitoring stopped");
        resolve(true);
      } else {
        const error = new Error("Failed to restore hosts file");
        logger.error(error.message);
        reject(error);
      }
    } catch (error) {
      logger.error(`Error stopping network monitor: ${error.message}`);

      // Even in case of error, mark monitor as stopped
      _isRunning = false;

      // Try to restore hosts file again
      try {
        fs.writeFileSync(getHostsPath(), originalHostsContent);
        logger.info("Emergency hosts file restoration successful");
        resolve(true);
      } catch (emergencyError) {
        logger.error(
          `Emergency hosts file restoration failed: ${emergencyError.message}`
        );
        reject(error);
      }
    }
  });
};

// Update rules
const updateRules = (newRules, user) => {
  rules = newRules || [];

  // Update current user if provided
  if (user) {
    currentUser = user;
  }

  // Update domain lists
  updateBlockedAndAllowedDomains();

  // If monitor is running and there are changes in blocked domains, update hosts file
  if (_isRunning) {
    updateHostsFile().then((success) => {
      if (success) {
        logger.info("Hosts file updated with new rules");
      } else {
        logger.error("Failed to update hosts file with new rules");
      }
    });
  }

  logger.info(`Network monitor rules updated: ${rules.length} rules`);
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

// Get list of block rules for UI
const getBlockRules = () => {
  const blockRules = rules
    .filter((rule) => rule.type === "block" && rule.isActive)
    .map((rule) => ({
      name: rule.name,
      websites: rule.resources.websites || [],
      applications: rule.resources.applications || [],
      isActive: rule.isActive,
    }));

  return blockRules;
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
  getHostsPath,
  flushDNSCache,
  extractDomain,
  isDomainBlocked,
  findRuleForDomain,
  getBlockRules,
};
