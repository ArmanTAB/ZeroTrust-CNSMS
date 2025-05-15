const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");
const logger = require("../main/logger");
const ruleSync = require("./ruleSync");

// Global variables
let _isRunning = false;
let rules = [];
let recentActivities = [];
let originalHostsContent = "";
let blockedDomains = [];
let allowedDomains = [];
let currentUser = null;
const MAX_ACTIVITIES = 100;

// Get path to hosts file depending on OS
const getHostsPath = () => {
  switch (os.platform()) {
    case "win32":
      return "C:\\Windows\\System32\\drivers\\etc\\hosts";
    case "darwin":
    case "linux":
      return "/etc/hosts";
    default:
      throw new Error("Unsupported platform");
  }
};

// Initialize network monitor
const init = async (userRules, user) => {
  try {
    rules = userRules || [];
    recentActivities = [];
    currentUser = user;

    // Save original content of hosts file
    const hostsPath = getHostsPath();
    logger.info(`Using hosts file at: ${hostsPath}`);

    try {
      originalHostsContent = fs.readFileSync(hostsPath, "utf8");
      logger.debug("Original hosts file content saved");
    } catch (error) {
      logger.error(`Error reading hosts file: ${error.message}`);
      return false;
    }

    // Extract domains from rules considering active status and time restrictions
    updateBlockedAndAllowedDomains();

    logger.info("Network monitor initialized with user rules");
    logger.info(
      `Blocked domains: ${blockedDomains.length}, Allowed domains: ${allowedDomains.length}`
    );
    return true;
  } catch (error) {
    logger.error(`Error initializing network monitor: ${error.message}`);
    return false;
  }
};

// Update blocked and allowed domain lists
const updateBlockedAndAllowedDomains = () => {
  blockedDomains = [];
  allowedDomains = [];

  // Log all rules for debugging
  logger.debug(`Updating domains from ${rules.length} rules`);
  rules.forEach((rule, i) => {
    logger.debug(
      `Rule ${i + 1}: ${rule.name}, Type: ${rule.type}, Active: ${
        rule.isActive || false
      }, isUserSpecific: ${rule.__userSpecific || false}`
    );
    if (rule.resources && rule.resources.websites) {
      logger.debug(`  Websites: ${JSON.stringify(rule.resources.websites)}`);
    }
  });

  // TEMPORARY: Force include all rules for testing, ignoring time restrictions
  // This allows checking if the block rules would work outside of time restrictions
  const activeRules = rules.filter(
    (rule) =>
      rule.isActive &&
      rule.resources &&
      rule.resources.websites &&
      rule.resources.websites.length > 0
  );

  logger.info(
    `Found ${activeRules.length} active rules with website resources`
  );

  // Process allow rules first (they have priority)
  const allowRules = activeRules.filter((rule) => rule.type === "allow");
  const blockRules = activeRules.filter((rule) => rule.type === "block");

  // Log detailed info about the block rules
  blockRules.forEach((rule, i) => {
    logger.debug(`Block rule ${i + 1}: ${rule.name}`);
    logger.debug(
      `  Active: ${rule.isActive}, User-specific: ${
        rule.__userSpecific || false
      }`
    );
    logger.debug(`  Conditions: ${JSON.stringify(rule.conditions || {})}`);
    logger.debug(`  Websites: ${JSON.stringify(rule.resources.websites)}`);
  });

  // Sort rules by priority (higher value = higher priority)
  allowRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  blockRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  logger.info(
    `Rules breakdown: ${blockRules.length} block rules, ${allowRules.length} allow rules`
  );

  // Process allow rules
  for (const rule of allowRules) {
    for (const website of rule.resources.websites) {
      // Extract domain
      const domain = extractDomain(website);

      if (domain && !allowedDomains.includes(domain)) {
        allowedDomains.push(domain);
        logger.debug(
          `Added allowed domain from rule "${rule.name}": ${domain}`
        );

        // Log allowed activity
        addActivity({
          timestamp: new Date(),
          type: "network",
          resource: domain,
          blocked: false,
          ruleName: rule.ruleName || rule.name,
          description: `Allowed access to ${domain} via rule "${rule.name}"`,
        });
      }
    }
  }

  // Process block rules
  for (const rule of blockRules) {
    for (const website of rule.resources.websites) {
      // Extract domain
      const domain = extractDomain(website);

      // Add domain to block list only if it's not in the allow list
      if (
        domain &&
        !allowedDomains.includes(domain) &&
        !blockedDomains.includes(domain)
      ) {
        blockedDomains.push(domain);
        logger.debug(
          `Added blocked domain from rule "${rule.name}": ${domain}`
        );
      }
    }
  }

  // Detailed logging
  if (blockedDomains.length > 0) {
    logger.info(`Blocked domains: ${blockedDomains.join(", ")}`);
  } else {
    logger.info("No domains are being blocked");
  }

  if (allowedDomains.length > 0) {
    logger.info(`Allowed domains: ${allowedDomains.join(", ")}`);
  } else {
    logger.info("No domains are explicitly allowed");
  }
};

// Extract domain from URL
const extractDomain = (url) => {
  try {
    // If URL doesn't start with http:// or https://, add http://
    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      fullUrl = `http://${url}`;
    }

    const urlObj = new URL(fullUrl);
    // Take only domain, without www
    let domain = urlObj.hostname;

    // Remove www. from beginning of domain, if present
    if (domain.startsWith("www.")) {
      domain = domain.substring(4);
    }

    return domain;
  } catch (error) {
    logger.warn(`Error extracting domain from ${url}: ${error.message}`);
    // If we can't parse URL, return original string without http:// and https://
    return url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
};

// Update hosts file
const updateHostsFile = async () => {
  const hostsPath = getHostsPath();

  try {
    // Form new hosts file content
    let newContent = originalHostsContent;

    // Check if our marker is already in the file
    if (!newContent.includes("# BEGIN ACCESS CONTROL AGENT BLOCK")) {
      newContent +=
        "\n\n# BEGIN ACCESS CONTROL AGENT BLOCK\n# END ACCESS CONTROL AGENT BLOCK\n";
    }

    // Form block with blocked domains
    let blockContent = "# BEGIN ACCESS CONTROL AGENT BLOCK\n";
    blockContent += "# Generated at: " + new Date().toISOString() + "\n";
    blockContent +=
      "# User: " +
      (currentUser
        ? `${currentUser.firstName} ${currentUser.lastName} (${currentUser.email})`
        : "Unknown") +
      "\n";

    if (blockedDomains.length > 0) {
      blockContent += "# Blocked domains:\n";
      for (const domain of blockedDomains) {
        blockContent += `127.0.0.1 ${domain}\n`;
        blockContent += `127.0.0.1 www.${domain}\n`;
      }
    } else {
      blockContent += "# No domains are currently blocked\n";
    }

    blockContent += "# END ACCESS CONTROL AGENT BLOCK\n";

    // Replace our block in the file
    newContent = newContent.replace(
      /# BEGIN ACCESS CONTROL AGENT BLOCK\n[\s\S]*?# END ACCESS CONTROL AGENT BLOCK\n/,
      blockContent
    );

    // Write updated file
    fs.writeFileSync(hostsPath, newContent);
    logger.info(
      `Hosts file updated with ${blockedDomains.length} blocked domains`
    );

    // Clear DNS cache
    await flushDNSCache();

    // Log domain blocking activity
    for (const domain of blockedDomains) {
      // Find which rule blocked this domain
      const blockingRule = findRuleForDomain(domain, "block");
      const ruleName = blockingRule
        ? blockingRule.ruleName || blockingRule.name
        : "Default rule";

      addActivity({
        timestamp: new Date(),
        type: "network",
        resource: domain,
        blocked: true,
        ruleName: ruleName,
        description: `Blocking access to ${domain} via hosts file (${ruleName})`,
      });
    }

    return true;
  } catch (error) {
    logger.error(`Error updating hosts file: ${error.message}`);
    return false;
  }
};

// Find which rule is responsible for blocking/allowing a domain
const findRuleForDomain = (domain, type) => {
  // First search in specific rules for this user
  const userRules = rules.filter((r) => r.__userSpecific && r.type === type);
  for (const rule of userRules) {
    if (rule.resources && rule.resources.websites) {
      for (const website of rule.resources.websites) {
        if (domain.includes(extractDomain(website))) {
          return rule;
        }
      }
    }
  }

  // Then search in all rules
  for (const rule of rules) {
    if (rule.type === type && rule.resources && rule.resources.websites) {
      for (const website of rule.resources.websites) {
        if (domain.includes(extractDomain(website))) {
          return rule;
        }
      }
    }
  }

  return null;
};

// Check if a domain is blocked
const isDomainBlocked = (domain) => {
  return blockedDomains.includes(domain);
};

// Restore original hosts file
const restoreHostsFile = async () => {
  const hostsPath = getHostsPath();

  try {
    // Check if file exists
    if (!fs.existsSync(hostsPath)) {
      logger.error(`Hosts file not found at: ${hostsPath}`);
      return false;
    }

    // Check if our marker is in the file
    const currentContent = fs.readFileSync(hostsPath, "utf8");

    if (currentContent.includes("# BEGIN ACCESS CONTROL AGENT BLOCK")) {
      // Restore original content
      fs.writeFileSync(hostsPath, originalHostsContent);
      logger.info("Hosts file restored to original state");

      // Clear DNS cache
      await flushDNSCache();

      // Log unblocking
      addActivity({
        timestamp: new Date(),
        type: "network",
        resource: "all domains",
        blocked: false,
        description: "All domain blocks removed",
      });

      return true;
    } else {
      logger.info("No blocks found in hosts file, nothing to restore");
      return true;
    }
  } catch (error) {
    logger.error(`Error restoring hosts file: ${error.message}`);
    return false;
  }
};

// Clear DNS cache
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
