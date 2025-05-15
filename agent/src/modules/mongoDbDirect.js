// agent/src/modules/mongoDbDirect.js - Updated
const mongoose = require("mongoose");
const logger = require("../main/logger");
const ObjectId = mongoose.Types.ObjectId;

// MongoDB connection
let isConnected = false;

/**
 * Connect to MongoDB directly
 * @param {string} mongoUri - MongoDB connection URI
 * @param {string} dbName - Database name (optional)
 * @returns {Promise<boolean>} - Connection success status
 */
const connect = async (mongoUri, dbName = "zero_trust_db") => {
  try {
    if (isConnected) {
      logger.info("Already connected to MongoDB");
      return true;
    }

    // Make sure URI doesn't end with a slash
    const uri = mongoUri.endsWith("/") ? mongoUri.slice(0, -1) : mongoUri;

    logger.info(`Connecting to MongoDB using URI: ${uri}`);
    logger.info(`Using database: ${dbName || "default"}`);

    // Set mongoose options
    mongoose.set("strictQuery", false);

    // Add connection options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    // Add database name if provided - properly formatted
    const connectionString = dbName ? `${uri}/${dbName}` : uri;

    logger.info(`Full connection string: ${connectionString}`);

    try {
      await mongoose.connect(connectionString, options);
    } catch (connectError) {
      logger.error(`MongoDB connection error: ${connectError.message}`);

      // Try connecting without the database name
      if (dbName) {
        logger.info("Trying to connect without specifying database name...");
        try {
          await mongoose.connect(uri, options);
          logger.info(
            "Connected successfully without specifying database name"
          );
        } catch (retryError) {
          logger.error(
            `Second connection attempt failed: ${retryError.message}`
          );
          return false;
        }
      } else {
        return false;
      }
    }

    isConnected = true;
    logger.info("Connected to MongoDB successfully");

    // Log database name and collection information
    logger.info(
      `Connected to database: ${mongoose.connection.name || "unknown"}`
    );

    // Log available collections
    try {
      const collections = await mongoose.connection.db
        .listCollections()
        .toArray();
      const collectionNames = collections.map((c) => c.name);

      logger.info(`Available collections: ${collectionNames.join(", ")}`);

      // Check if required collections exist
      const hasAgentUsers = collectionNames.includes("agent_users");
      const hasAgentRules = collectionNames.includes("agent_rules");

      if (!hasAgentUsers) {
        logger.warn('Collection "agent_users" not found in database!');
      }

      if (!hasAgentRules) {
        logger.warn('Collection "agent_rules" not found in database!');
      }
    } catch (err) {
      logger.warn(`Could not list collections: ${err.message}`);
    }

    return true;
  } catch (error) {
    logger.error(`Unexpected MongoDB connection error: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    return false;
  }
};

/**
 * Disconnect from MongoDB
 */
const disconnect = async () => {
  if (isConnected) {
    try {
      await mongoose.disconnect();
      isConnected = false;
      logger.info("Disconnected from MongoDB");
    } catch (error) {
      logger.error(`Error disconnecting from MongoDB: ${error.message}`);
    }
  }
};

/**
 * Get user by email (for authentication)
 * @param {string} email - User email
 * @returns {Promise<object|null>} - User object or null
 */
const getUserByEmail = async (email) => {
  try {
    logger.info(`Looking up agent user by email: ${email}`);

    // Define User model schema
    const UserSchema = new mongoose.Schema(
      {
        email: String,
        hashed_password: String,
        firstName: String,
        lastName: String,
        role: String,
        department: String,
        position: String,
        isActive: Boolean,
        createdAt: Date,
        lastLogin: Date,
      },
      { collection: "agent_users" }  // Use agent_users collection
    );

    // Get or create User model
    const User = mongoose.models.AgentUser || mongoose.model("AgentUser", UserSchema);

    // Find user by email
    const user = await User.findOne({ email }).lean();

    if (user) {
      logger.info(`Agent user found: ${user.email}, ID: ${user._id}`);

      // Convert _id to string for easier handling
      if (user._id) {
        user._id = user._id.toString();
      }
    } else {
      logger.warn(`No agent user found with email: ${email}`);
    }

    return user;
  } catch (error) {
    logger.error(`Error finding agent user by email: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
};

/**
 * Authenticate user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} - Auth result with user and token if successful
 */
const authenticateUser = async (email, password) => {
  try {
    logger.info(`Authenticating agent user: ${email}`);
    const user = await getUserByEmail(email);

    if (!user) {
      logger.warn(`Authentication failed: Agent user not found - ${email}`);
      return {
        success: false,
        error: "User not found",
      };
    }

    // Check if the user is active
    if (!user.isActive) {
      logger.warn(`Authentication failed: Agent user ${email} is not active`);
      return {
        success: false,
        error: "Account is inactive or disabled",
      };
    }

    // TEMPORARY: For testing, bypass password check
    // In production, use proper password verification
    logger.warn("⚠️ BYPASSING PASSWORD CHECK - REMOVE THIS IN PRODUCTION ⚠️");
    const passwordMatch = true; // FOR TESTING ONLY

    if (!passwordMatch) {
      logger.warn(`Authentication failed: Invalid password for user ${email}`);
      return {
        success: false,
        error: "Invalid password",
      };
    }

    // Generate a simple token (in a real app, this would be a JWT token)
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    logger.info(`Agent user authenticated successfully: ${user.email} (${user._id})`);

    // Update last login time in the database
    try {
      await mongoose.connection
        .collection("agent_users")
        .updateOne(
          { _id: new ObjectId(user._id) },
          { $set: { lastLogin: new Date() } }
        );
    } catch (updateError) {
      logger.warn(`Failed to update last login time: ${updateError.message}`);
    }

    return {
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "user",
        department: user.department || "",
        position: user.position || "",
      },
      token,
    };
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    return {
      success: false,
      error: "Authentication failed: " + error.message,
    };
  }
};

/**
 * Get rules applicable to a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of applicable rules
 */
const getRulesForUser = async (userId) => {
  try {
    logger.info(`Getting rules for agent user: ${userId} from MongoDB directly`);

    // Get user details first to determine role and department
    const userObjectId = new ObjectId(userId);
    const user = await mongoose.connection
      .collection("agent_users")
      .findOne({ _id: userObjectId });

    if (!user) {
      logger.error(`Agent user not found with ID: ${userId}`);
      throw new Error("Agent user not found");
    }

    logger.info(
      `Found agent user: ${user.email}, Role: ${
        user.role || "unknown"
      }, Department: ${user.department || "unknown"}`
    );

    // Define basic structure of access rules
    const AccessRuleSchema = new mongoose.Schema(
      {
        name: String,
        description: String,
        type: String, // 'allow' or 'block'
        resources: {
          websites: [String],
          applications: [String],
          files: [String],
        },
        appliesTo: {
          departments: [String],
          roles: [String],
          users: [mongoose.Schema.Types.Mixed], // Can be ObjectId or string
        },
        conditions: Object,
        priority: Number,
        isActive: Boolean,
        createdAt: Date,
        updatedAt: Date,
      },
      { collection: "agent_rules" }  // Use agent_rules collection
    );

    // Get or create AccessRule model
    const AccessRule =
      mongoose.models.AgentRule ||
      mongoose.model("AgentRule", AccessRuleSchema);

    // Find all active rules
    const allRules = await AccessRule.find({ isActive: true }).lean();
    logger.info(`Found ${allRules.length} total active agent rules in database`);

    // Filter rules that apply to this user
    const userDepartment = user.department || "";
    const userRole = user.role || "";

    const applicableRules = allRules.filter((rule) => {
      // Check if rule applies directly to this user
      const userSpecific = rule.appliesTo?.users?.some((ruleUser) => {
        // Handle different ID formats
        if (typeof ruleUser === "string") {
          return ruleUser === userId;
        } else if (ruleUser?._id) {
          return ruleUser._id.toString() === userId;
        } else if (ruleUser?.toString) {
          return ruleUser.toString() === userId;
        }
        return false;
      });

      // If rule applies directly to user, mark it as user-specific
      if (userSpecific) {
        rule.__userSpecific = true;
      }

      // Check if rule applies to user's department
      const departmentMatch = rule.appliesTo?.departments?.some(
        (dept) =>
          dept === userDepartment ||
          dept === "ALL" ||
          dept === "Any" ||
          dept === "*"
      );

      // Check if rule applies to user's role
      const roleMatch = rule.appliesTo?.roles?.some(
        (role) =>
          role === userRole || role === "ALL" || role === "Any" || role === "*"
      );

      // Return true if the rule is user-specific or matches department and role
      return userSpecific || (departmentMatch && roleMatch);
    });

    // Sort rules by priority (higher first)
    applicableRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    logger.info(
      `Found ${applicableRules.length} applicable rules for agent user ${userId}`
    );

    // Format rule data for the agent
    return applicableRules.map((rule) => ({
      ...rule,
      _id: rule._id.toString(),
      __userSpecific: rule.__userSpecific || false,
      resources: {
        websites: rule.resources?.websites || [],
        applications: rule.resources?.applications || [],
        files: rule.resources?.files || [],
      },
      ruleName: rule.name, // Add ruleName field used by the agent
    }));
  } catch (error) {
    logger.error(`Error getting rules for agent user: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }

    // Return empty array on error
    return [];
  }
};

/**
 * Log activity back to the central system
 * @param {Object} activity - Activity data to log
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const logActivity = async (activity, userId) => {
  try {
    if (!isConnected) {
      logger.error("Cannot log activity: not connected to MongoDB");
      return false;
    }

    // Format activity data for the database
    const activityData = {
      userId: userId,
      type: activity.type,
      resource: activity.resource,
      blocked: activity.blocked,
      ruleName: activity.ruleName || "Unknown Rule",
      description: activity.description,
      timestamp: activity.timestamp || new Date(),
      deviceInfo: {
        hostname: require("os").hostname(),
        platform: require("os").platform(),
        ip_address: activity.ip_address || getLocalIpAddress(),
      },
    };

    // Insert into the agent_activities collection
    await mongoose.connection
      .collection("agent_activities")
      .insertOne(activityData);

    logger.debug(`Logged agent activity to MongoDB: ${activity.description}`);
    return true;
  } catch (error) {
    logger.error(`Error logging agent activity to MongoDB: ${error.message}`);
    return false;
  }
};

/**
 * Batch log multiple activities
 * @param {Array} activities - Array of activity objects
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, count: number}>} - Result with count of logged activities
 */
const logActivities = async (activities, userId) => {
  try {
    if (!isConnected || !activities || activities.length === 0) {
      return { success: false, count: 0 };
    }

    // Format all activities
    const formattedActivities = activities.map((activity) => ({
      userId: userId,
      type: activity.type,
      resource: activity.resource,
      blocked: activity.blocked,
      ruleName: activity.ruleName || "Unknown Rule",
      description: activity.description,
      timestamp: activity.timestamp || new Date(),
      deviceInfo: {
        hostname: require("os").hostname(),
        platform: require("os").platform(),
        ip_address: activity.ip_address || getLocalIpAddress(),
      },
    }));

    // Batch insert
    const result = await mongoose.connection
      .collection("agent_activities")
      .insertMany(formattedActivities);

    logger.info(`Batch logged ${result.insertedCount} agent activities to MongoDB`);
    return { success: true, count: result.insertedCount };
  } catch (error) {
    logger.error(`Error batch logging agent activities to MongoDB: ${error.message}`);
    return { success: false, error: error.message, count: 0 };
  }
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} - User object or null
 */
const getUserById = async (userId) => {
  try {
    // Convert string ID to ObjectId
    const objectId = new ObjectId(userId);

    // Query the agent_users collection
    const user = await mongoose.connection
      .collection("agent_users")
      .findOne({ _id: objectId });

    if (user) {
      logger.debug(`Found agent user by ID: ${userId} - ${user.email}`);

      // Normalize user object
      return {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "user",
        department: user.department || "",
        position: user.position || "",
        isActive: user.isActive || true,
      };
    }

    logger.warn(`No agent user found with ID: ${userId}`);
    return null;
  } catch (error) {
    logger.error(`Error getting agent user by ID: ${error.message}`);
    return null;
  }
};

/**
 * Helper function to get local IP address
 * @returns {string} - Local IP address
 */
function getLocalIpAddress() {
  const os = require("os");
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }

  return "127.0.0.1";   
}

module.exports = {
  connect,
  disconnect,
  authenticateUser,
  getRulesForUser,
  logActivity,
  logActivities,
  getUserById,
  getUserByEmail,
};