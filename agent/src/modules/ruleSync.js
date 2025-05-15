// agent/src/modules/ruleSync.js - Updated
const axios = require("axios");
const mongoDbDirect = require("./mongoDbDirect");
const logger = require("../main/logger");

// Helper for finding user rules by handling different ID formats
const isUserIdMatch = (ruleUser, userId) => {
  // If userId is an email, special comparison is needed
  const isEmail = userId && userId.includes("@");

  // Handle string comparison
  if (typeof ruleUser === "string") {
    if (isEmail && ruleUser.includes("@")) {
      return ruleUser === userId;
    }
    return ruleUser === userId;
  }
  // Handle object comparison
  else if (typeof ruleUser === "object") {
    if (ruleUser === null) return false;

    // Handle MongoDB ObjectId references
    if (ruleUser._id) return ruleUser._id === userId;
    if (ruleUser.$oid) return ruleUser.$oid === userId;

    // Handle objects with email property
    if (isEmail && ruleUser.email) return ruleUser.email === userId;

    // Try to find userId in the stringified object
    const objStr = JSON.stringify(ruleUser);
    return objStr.includes(userId);
  }

  return false;
};

// Get rules for user
const getRules = async (userId, token, apiUrl) => {
  try {
    logger.info(`Fetching access rules for user ${userId}`);

    // First try - using the Agent API endpoint
    try {
      const response = await axios.get(`${apiUrl}/agent/rules/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000, // Add timeout to prevent hanging
      });

      if (response.data) {
        const rules = response.data;
        logger.info(`Received ${rules.length} access rules for user ${userId} from Agent API`);

        // Process rules to normalize the structure for consistent handling
        const normalizedRules = rules.map((rule) =>
          normalizeRuleStructure(rule, userId)
        );

        // Log details about rules
        normalizedRules.forEach((rule, index) => {
          const userSpecific = rule.__userSpecific
            ? "(Directly assigned to user)"
            : "";
          logger.debug(`Rule ${index + 1}: ${rule.name} ${userSpecific}`);
          logger.debug(
            `  Type: ${rule.type}, Priority: ${rule.priority}, Active: ${rule.isActive}`
          );

          if (rule.resources) {
            if (rule.resources.websites && rule.resources.websites.length > 0) {
              logger.debug(`  Websites: ${rule.resources.websites.join(", ")}`);
            }
            if (
              rule.resources.applications &&
              rule.resources.applications.length > 0
            ) {
              logger.debug(
                `  Applications: ${rule.resources.applications.join(", ")}`
              );
            }
            if (rule.resources.files && rule.resources.files.length > 0) {
              logger.debug(`  Files: ${rule.resources.files.join(", ")}`);
            }
          }
        });

        return normalizedRules;
      } else {
        throw new Error("Invalid response from Agent API");
      }
    } catch (apiError) {
      // If API request fails, log the error and try direct MongoDB connection
      logger.warn(
        `Error getting rules from Agent API: ${apiError.message}, trying MongoDB direct connection`
      );
      
      // Connect to MongoDB
      const mongoUri = require("../main/main").config.mongoUri;
      const connected = await mongoDbDirect.connect(mongoUri, "zero_trust_db");
      
      if (!connected) {
        throw new Error("Failed to connect to MongoDB");
      }
      
      // Get rules directly from MongoDB
      const rules = await mongoDbDirect.getRulesForUser(userId);
      
      logger.info(`Retrieved ${rules.length} rules from MongoDB directly`);
      
      // Normalize and return the rules
      const normalizedRules = rules.map((rule) => normalizeRuleStructure(rule, userId));
      return normalizedRules;
    }
  } catch (error) {
    logger.error(`Error fetching access rules: ${error.message}`);
    if (error.response) {
      logger.error(
        `API error details: ${JSON.stringify(error.response.data || {})}`
      );
    }

    // Return default rules as fallback when all else fails
    logger.warn("Returning default fallback rules");
    return getDefaultRules();
  }
};

// Helper function to normalize rule structure
const normalizeRuleStructure = (rule, userId) => {
  // Create a deep copy to avoid modifying the original
  const normalizedRule = JSON.parse(JSON.stringify(rule));

  // Log the raw rule structure for debugging
  logger.debug(`Normalizing rule: ${JSON.stringify(rule)}`);

  // Make sure ID uses consistent format (_id to id if needed)
  if (rule._id && !rule.id) {
    normalizedRule.id = rule._id;
  }

  // Check if this rule is directly assigned to the user
  if (
    rule.appliesTo &&
    rule.appliesTo.users &&
    Array.isArray(rule.appliesTo.users)
  ) {
    normalizedRule.__userSpecific = rule.appliesTo.users.some((ruleUser) =>
      isUserIdMatch(ruleUser, userId)
    );

    if (normalizedRule.__userSpecific) {
      logger.info(
        `Rule "${rule.name}" (${rule.type}) is directly assigned to user ${userId}`
      );
    }
  }

  // Ensure consistent structure for resources
  if (!normalizedRule.resources) {
    normalizedRule.resources = {};
  }
  if (!Array.isArray(normalizedRule.resources.websites)) {
    normalizedRule.resources.websites = [];
  }
  if (!Array.isArray(normalizedRule.resources.applications)) {
    normalizedRule.resources.applications = [];
  }
  if (!Array.isArray(normalizedRule.resources.files)) {
    normalizedRule.resources.files = [];
  }

  // Add a friendly ruleName to use in the activity logs
  normalizedRule.ruleName = `${normalizedRule.name} ${
    normalizedRule.__userSpecific ? "(Personal Rule)" : ""
  }`;

  return normalizedRule;
};

// Default fallback rules to use when server communication fails
const getDefaultRules = () => {
  logger.warn("Using fallback default rules - minimal protection enabled");
  return [
    {
      name: "Emergency Fallback Rule - Allow Essential",
      description: "Default allow rule used when server is unavailable",
      type: "allow",
      resources: {
        websites: ["google.com", "microsoft.com", "office.com", "bing.com"],
        applications: [
          "chrome.exe",
          "msedge.exe",
          "firefox.exe",
          "outlook.exe",
          "winword.exe",
          "excel.exe",
        ],
        files: [],
      },
      priority: 100,
      isActive: true,
      ruleName: "Emergency Fallback Rule - Allow Essential",
    },
    {
      name: "Emergency Fallback Rule - Block Social Media",
      description: "Default block rule used when server is unavailable",
      type: "block",
      resources: {
        websites: [
          "facebook.com",
          "twitter.com",
          "instagram.com",
          "tiktok.com",
        ],
        applications: [],
        files: [],
      },
      priority: 50,
      isActive: true,
      ruleName: "Emergency Fallback Rule - Block Social Media",
    },
  ];
};

// Send activity logs to server
const sendActivityLogs = async (logsData, token, apiUrl) => {
  try {
    logger.info(`Sending ${logsData.length} activity logs to server`);

    // Try using the Agent API endpoint first
    try {
      const response = await axios.post(
        `${apiUrl}/agent/logs/batch`,
        { logs: logsData },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data.success) {
        logger.info(
          `Successfully sent ${logsData.length} activity logs to server via Agent API`
        );
        return {
          success: true,
          count: logsData.length,
        };
      } else {
        throw new Error("Invalid response from Agent API");
      }
    } catch (apiError) {
      logger.warn(
        `Error sending logs to Agent API: ${apiError.message}, trying MongoDB direct connection`
      );
      
      // Connect to MongoDB
      const mongoUri = require("../main/main").config.mongoUri;
      const connected = await mongoDbDirect.connect(mongoUri, "zero_trust_db");
      
      if (!connected) {
        throw new Error("Failed to connect to MongoDB");
      }
      
      // Get the user ID from the first log
      let userId = null;
      if (logsData.length > 0 && logsData[0].userId) {
        userId = logsData[0].userId;
      }
      
      // Log activities directly to MongoDB
      const result = await mongoDbDirect.logActivities(logsData, userId);
      
      if (result.success) {
        logger.info(`Successfully logged ${result.count} activities directly to MongoDB`);
      } else {
        throw new Error(`Failed to log activities to MongoDB: ${result.error || "Unknown error"}`);
      }
      
      return result;
    }
  } catch (error) {
    logger.error(`Error sending activity logs: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Check rules considering time restrictions
const isRuleActive = (rule) => {
  // Log the rule for debugging
  logger.debug(
    `Checking if rule is active: ${rule.name} (${rule.type}), isActive flag: ${rule.isActive}`
  );

  // If rule is not marked as active, it's inactive
  if (!rule.isActive) {
    logger.debug(`Rule "${rule.name}" is marked as inactive`);
    return false;
  }

  // Check if rule has resources
  if (!rule.resources) {
    logger.debug(`Rule "${rule.name}" has no resources`);
    return false;
  }

  // DISABLED TIME RESTRICTIONS FOR DEBUGGING - Always consider user-specific rules active
  if (rule.__userSpecific) {
    logger.debug(
      `Rule "${rule.name}" is user-specific, ignoring time restrictions`
    );
    return true;
  }

  // Time restrictions are disabled for debugging - always return true if rule is active
  return true;

  /* ORIGINAL TIME RESTRICTION CODE - Commented out for debugging
  // If time restrictions are not enabled, rule is always active
  if (!rule.conditions || 
      !rule.conditions.timeRestrictions || 
      !rule.conditions.timeRestrictions.enabled) {
    return true;
  }
  
  const timeRestrictions = rule.conditions.timeRestrictions;
  const now = new Date();
  
  // Check day of week (0 - Sunday, 1 - Monday, ...)
  const currentDay = now.getDay();
  
  // If day of week is not in the list of allowed days, rule is inactive
  if (timeRestrictions.days && 
      timeRestrictions.days.length > 0 && 
      !timeRestrictions.days.includes(currentDay)) {
    return false;
  }
  
  // Check time
  if (timeRestrictions.startTime && timeRestrictions.endTime) {
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
    
    // Parse start and end time
    const startParts = timeRestrictions.startTime.split(':');
    const endParts = timeRestrictions.endTime.split(':');
    
    if (startParts.length === 2 && endParts.length === 2) {
      const startTime = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endTime = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      
      // If current time is not in the interval, rule is inactive
      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }
  }
  
  // If all checks pass, rule is active
  return true;
  */
};

module.exports = {
  getRules,
  sendActivityLogs,
  isRuleActive,
};