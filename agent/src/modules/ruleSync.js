// src/modules/ruleSync.js
const axios = require("axios");
const { MongoClient, ObjectId } = require("mongodb");
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
    if (ruleUser._id) return ruleUser._id.toString() === userId;
    if (ruleUser.$oid) return ruleUser.$oid === userId;

    // Handle objects with email property
    if (isEmail && ruleUser.email) return ruleUser.email === userId;

    // Try to find userId in the stringified object
    const objStr = JSON.stringify(ruleUser);
    return objStr.includes(userId);
  }

  return false;
};

// Get rules for a specific user
async function getRules(userId, token, apiUrl) {
  try {
    logger.info(`Fetching access rules for user ${userId}`);

    // First try - using API endpoint
    try {
      // Assuming your API has an endpoint for fetching user-specific rules
      const response = await axios.get(
        `${apiUrl}/devices/rules/user/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000, // Add timeout to prevent hanging
        }
      );

      if (
        response.data &&
        (response.data.success || Array.isArray(response.data))
      ) {
        const rules = Array.isArray(response.data)
          ? response.data
          : response.data.data || [];
        logger.info(
          `Received ${rules.length} access rules for user ${userId} via API`
        );

        // Process rules to normalize the structure for consistent handling
        const normalizedRules = rules.map((rule) =>
          normalizeRuleStructure(rule, userId)
        );

        return normalizedRules;
      }
    } catch (apiError) {
      logger.warn(
        `API rules fetch failed: ${apiError.message}. Trying direct MongoDB query...`
      );
    }

    // If API fails, try direct MongoDB query
    try {
      // Find MongoDB client from auth module
      const { MongoClient, ObjectId } = require("mongodb");

      // Extract MongoDB URI from API URL
      const mongoUri =
        apiUrl.replace("/api", "").replace("http://", "mongodb://") +
        "/zero_trust_db";

      // Connect to MongoDB
      const client = new MongoClient(mongoUri);
      await client.connect();

      const db = client.db("zero_trust_db");

      // First, get user details to know role and department
      const user = await db
        .collection("users")
        .findOne({ _id: new ObjectId(userId) });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      logger.info(
        `Found user: ${user.email}, Role: ${
          user.role || "undefined"
        }, Department: ${user.department || "undefined"}`
      );

      // Query for rules that apply to this user
      // This assumes your rules collection has a structure with appliesTo fields
      const rulesCollection = db.collection("accessrules");

      const rules = await rulesCollection
        .find({
          $and: [
            { isActive: true },
            {
              $or: [
                { "appliesTo.users": userId },
                { "appliesTo.roles": user.role },
                { "appliesTo.departments": user.department },
              ],
            },
          ],
        })
        .toArray();

      client.close();

      logger.info(`Found ${rules.length} applicable rules from MongoDB`);

      // Normalize rules
      const normalizedRules = rules.map((rule) =>
        normalizeRuleStructure(rule, userId)
      );

      return normalizedRules;
    } catch (mongoError) {
      logger.error(`MongoDB rules fetch failed: ${mongoError.message}`);

      // Return default rules as a last resort
      return getDefaultRules();
    }
  } catch (error) {
    logger.error(`Error fetching access rules: ${error.message}`);
    return getDefaultRules();
  }
}

// Helper function to normalize rule structure
function normalizeRuleStructure(rule, userId) {
  // Create a deep copy to avoid modifying the original
  const normalizedRule = JSON.parse(JSON.stringify(rule));

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
}

// Default fallback rules to use when server communication fails
function getDefaultRules() {
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
}

// Send activity logs back to the main system
async function sendActivityLogs(logsData, token, apiUrl) {
  try {
    logger.info(`Sending ${logsData.length} activity logs to server`);

    // First try API
    try {
      const response = await axios.post(
        `${apiUrl}/access/log/batch`,
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
          `Successfully sent ${logsData.length} activity logs via API`
        );
        return {
          success: true,
          count: logsData.length,
        };
      }
    } catch (apiError) {
      logger.warn(
        `API log sending failed: ${apiError.message}. Trying direct MongoDB...`
      );
    }

    // If API fails, try direct MongoDB
    try {
      // Extract MongoDB URI from API URL
      const mongoUri =
        apiUrl.replace("/api", "").replace("http://", "mongodb://") +
        "/zero_trust_db";

      // Connect to MongoDB
      const client = new MongoClient(mongoUri);
      await client.connect();

      const db = client.db("zero_trust_db");

      // Insert logs into access_logs collection
      const result = await db.collection("access_logs").insertMany(logsData);
      client.close();

      logger.info(
        `Successfully inserted ${result.insertedCount} logs directly into MongoDB`
      );

      return {
        success: true,
        count: result.insertedCount,
      };
    } catch (mongoError) {
      logger.error(`MongoDB log insertion failed: ${mongoError.message}`);
      throw mongoError;
    }
  } catch (error) {
    logger.error(`Error sending activity logs: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Check if a rule is active based on time restrictions
function isRuleActive(rule) {
  // Log the rule for debugging
  logger.debug(
    `Checking if rule is active: ${rule.name} (${rule.type}), isActive flag: ${rule.isActive}`
  );

  // If rule is not marked as active, it's inactive
  if (!rule.isActive) {
    logger.debug(`Rule "${rule.name}" is marked as inactive`);
    return false;
  }

  // User-specific rules always take precedence
  if (rule.__userSpecific) {
    logger.debug(
      `Rule "${rule.name}" is user-specific, ignoring time restrictions`
    );
    return true;
  }

  // If rule has no time restrictions or they're not enabled, it's active
  if (
    !rule.conditions ||
    !rule.conditions.timeRestrictions ||
    !rule.conditions.timeRestrictions.enabled
  ) {
    return true;
  }

  const timeRestrictions = rule.conditions.timeRestrictions;
  const now = new Date();

  // Check day of week (0 - Sunday, 1 - Monday, ...)
  const currentDay = now.getDay();

  // If day of week is not in allowed days, rule is inactive
  if (
    timeRestrictions.days &&
    timeRestrictions.days.length > 0 &&
    !timeRestrictions.days.includes(currentDay)
  ) {
    return false;
  }

  // Check time
  if (timeRestrictions.startTime && timeRestrictions.endTime) {
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes

    // Parse start and end times
    const startParts = timeRestrictions.startTime.split(":");
    const endParts = timeRestrictions.endTime.split(":");

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
}

module.exports = {
  getRules,
  sendActivityLogs,
  isRuleActive,
};
