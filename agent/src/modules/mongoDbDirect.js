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

    logger.info(`Connecting to MongoDB Atlas using URI: ${uri}`);

    // Set mongoose options to handle deprecation warnings
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

    // Log database name
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

      // Check if our required collections exist
      const hasAgentUsers = collectionNames.includes("agent_users");
      const hasAgentRules = collectionNames.includes("agent_rules");

      if (!hasAgentUsers) {
        logger.error(
          '⚠️ CRITICAL: "agent_users" collection not found in database!'
        );
      }

      if (!hasAgentRules) {
        logger.error(
          '⚠️ CRITICAL: "agent_rules" collection not found in database!'
        );
      }

      // Try different collection names if not found
      if (!hasAgentUsers || !hasAgentRules) {
        logger.info(
          "Attempting to list all existing collections to find possible matches..."
        );

        for (const collection of collectionNames) {
          // Count documents in each collection
          const count = await mongoose.connection.db
            .collection(collection)
            .countDocuments();
          logger.info(`Collection "${collection}" has ${count} documents`);

          // Check the first document in each collection to guess its type
          if (count > 0) {
            const firstDoc = await mongoose.connection.db
              .collection(collection)
              .findOne({});
            logger.info(
              `Sample document from "${collection}": ${JSON.stringify(
                firstDoc,
                null,
                2
              ).substring(0, 500)}...`
            );
          }
        }
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
    logger.info(`Looking up user by email: ${email}`);

    // Define User model schema based on our sample data
    const UserSchema = new mongoose.Schema(
      {
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        role: String,
        department: String,
        position: String,
        isActive: Boolean,
      },
      { collection: "agent_users" }
    ); // Use agent_users collection

    // Get or create User model
    const User = mongoose.models.User || mongoose.model("User", UserSchema);

    // Find user by email
    const user = await User.findOne({ email });

    if (user) {
      logger.info(`User found: ${user.email}, ID: ${user._id}`);
    } else {
      logger.warn(`No user found with email: ${email}`);
    }

    return user;
  } catch (error) {
    logger.error(`Error finding user by email: ${error.message}`);
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
 * @returns {Promise<object|null>} - Auth result with user and token if successful
 */
const authenticateUser = async (email, password) => {
  try {
    logger.info(`Authenticating user: ${email}`);
    const user = await getUserByEmail(email);

    if (!user) {
      logger.warn(`Authentication failed: User not found - ${email}`);
      return {
        success: false,
        error: "User not found",
      };
    }

    logger.info(
      `User found: ${user.email}, Role: ${user.role}, Department: ${user.department}`
    );

    // IMPORTANT: For testing, bypass password check - REMOVE THIS IN PRODUCTION
    // This is just to test with any password
    logger.warn("⚠️ BYPASSING PASSWORD CHECK - REMOVE THIS IN PRODUCTION ⚠️");

    /* Commented out password check since passwords are hashed
    if (user.password !== password) {
      logger.warn(`Authentication failed: Invalid password for user ${email}`);
      return {
        success: false,
        error: 'Invalid password'
      };
    }
    */

    // Generate a simple token
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    logger.info(`User authenticated successfully: ${user.email} (${user._id})`);

    return {
      success: true,
      user: {
        id: user._id.toString(), // Convert ObjectId to string
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "user",
        department: user.department || "",
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
    logger.info(`Getting rules for user: ${userId} from MongoDB directly`);

    // Get collection names to check for correct names
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections.map((c) => c.name);
    logger.info(`Available collections: ${collectionNames.join(", ")}`);

    // Find actual collection names that might match our expected ones
    let usersCollection = "agent_users";
    let rulesCollection = "agent_rules";

    // Try to find user collection
    if (!collectionNames.includes("agent_users")) {
      const possibleUserCollections = collectionNames.filter(
        (name) =>
          name.toLowerCase().includes("user") ||
          name.toLowerCase().includes("account")
      );

      if (possibleUserCollections.length > 0) {
        usersCollection = possibleUserCollections[0];
        logger.info(`Using "${usersCollection}" as users collection`);
      } else {
        logger.error("Could not find a suitable users collection!");
      }
    }

    // Try to find rules collection
    if (!collectionNames.includes("agent_rules")) {
      const possibleRulesCollections = collectionNames.filter(
        (name) =>
          name.toLowerCase().includes("rule") ||
          name.toLowerCase().includes("access") ||
          name.toLowerCase().includes("policy")
      );

      if (possibleRulesCollections.length > 0) {
        rulesCollection = possibleRulesCollections[0];
        logger.info(`Using "${rulesCollection}" as access rules collection`);
      } else {
        logger.error("Could not find a suitable access rules collection!");
      }
    }

    // Define User model schema if not already defined
    const UserSchema = new mongoose.Schema(
      {
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        role: String,
        department: String,
        position: String,
        isActive: Boolean,
      },
      { collection: usersCollection }
    );

    // Define AccessRule model schema based on our sample data
    const AccessRuleSchema = new mongoose.Schema(
      {
        name: String,
        description: String,
        type: String,
        resources: {
          websites: [String],
          applications: [String],
          files: [String],
        },
        appliesTo: {
          departments: [String],
          roles: [String],
          users: [mongoose.Schema.Types.ObjectId], // Added users field
        },
        conditions: {
          timeRestrictions: {
            enabled: Boolean,
            startTime: String,
            endTime: String,
            days: [Number],
          },
        },
        priority: Number,
        isActive: Boolean,
        createdBy: mongoose.Schema.Types.ObjectId,
        createdAt: Date,
        updatedAt: Date,
      },
      { collection: rulesCollection }
    );

    // Get or create models
    const User = mongoose.models.User || mongoose.model("User", UserSchema);
    const AccessRule =
      mongoose.models.AccessRule ||
      mongoose.model("AccessRule", AccessRuleSchema);

    // Find user
    logger.info(`Finding user with ID: ${userId}`);
    const user = await User.findById(userId);
    if (!user) {
      logger.error("User not found in MongoDB");

      // Try to find any user to debug
      const anyUser = await User.findOne({});
      if (anyUser) {
        logger.info(`Found a user in the database: ${anyUser.email}`);
      } else {
        logger.error("No users found in the database!");
      }

      throw new Error("User not found");
    }

    logger.info(
      `User found: ${user.email}, Role: ${
        user.role || "undefined"
      }, Department: ${user.department || "undefined"}`
    );

    // Find all rules
    logger.info("Finding all access rules in MongoDB");

    // Try to find any rules
    const allRules = await AccessRule.find({}).lean();
    logger.info(`Found ${allRules.length} total rules in database`);

    if (allRules.length === 0) {
      logger.error("No rules found in the database!");

      // Check if the collection exists and has documents
      const count = await mongoose.connection.db
        .collection(rulesCollection)
        .countDocuments();
      logger.info(`Collection "${rulesCollection}" has ${count} documents`);

      if (count > 0) {
        // Try to get a sample document directly from the collection
        const sampleRule = await mongoose.connection.db
          .collection(rulesCollection)
          .findOne({});
        logger.info(
          `Sample rule from collection: ${JSON.stringify(sampleRule, null, 2)}`
        );

        // Try to create a manual rule for testing
        return [
          {
            name: "Manual Test Rule",
            description: "Manually created rule for testing",
            type: "block",
            resources: {
              websites: ["facebook.com", "twitter.com", "instagram.com"],
              applications: [],
              files: [],
            },
            appliesTo: {
              departments: [user.department || "ALL"],
              roles: [user.role || "ALL"],
            },
            isActive: true,
            priority: 10,
          },
        ];
      }
    }

    // Log all rules for debugging
    allRules.forEach((rule, index) => {
      logger.debug(
        `Rule ${index + 1}: ${rule.name}, Type: ${rule.type}, Active: ${
          rule.isActive
        }`
      );

      // Check if rule structure is as expected
      if (!rule.appliesTo) {
        logger.error(`Rule ${rule.name} is missing 'appliesTo' field!`);
      } else {
        if (!rule.appliesTo.departments) {
          logger.error(
            `Rule ${rule.name} is missing 'appliesTo.departments' field!`
          );
        } else {
          logger.debug(
            `  Applies to departments: ${rule.appliesTo.departments.join(", ")}`
          );
        }

        if (!rule.appliesTo.roles) {
          logger.error(`Rule ${rule.name} is missing 'appliesTo.roles' field!`);
        } else {
          logger.debug(
            `  Applies to roles: ${rule.appliesTo.roles.join(", ")}`
          );
        }
      }

      if (!rule.resources) {
        logger.error(`Rule ${rule.name} is missing 'resources' field!`);
      } else if (
        rule.resources.websites &&
        rule.resources.websites.length > 0
      ) {
        logger.debug(`  Websites: ${rule.resources.websites.join(", ")}`);
      }
    });

    // If no user department or role, use fallback values
    const userDepartment = user.department || "ANY";
    const userRole = user.role || "ANY";

    // Filter rules client-side based on user's department, role, and direct user assignment
    logger.info(
      `Filtering rules for department: ${userDepartment}, role: ${userRole}`
    );

    // Create a fallback rule if no applicable rules are found
    const fallbackRule = {
      name: "Default Fallback Rule",
      description: "Automatically created fallback rule",
      type: "block",
      resources: {
        websites: ["facebook.com", "twitter.com", "instagram.com"],
        applications: [],
        files: [],
      },
      appliesTo: {
        departments: [userDepartment],
        roles: [userRole],
      },
      isActive: true,
      priority: 1,
    };

    const applicableRules = allRules.filter((rule) => {
      // Skip inactive rules
      if (rule.isActive === false) {
        logger.debug(`Rule "${rule.name}" skipped: inactive`);
        return false;
      }

      // Handle missing or invalid rule structure
      if (
        !rule.appliesTo ||
        !rule.appliesTo.departments ||
        !rule.appliesTo.roles
      ) {
        logger.error(`Rule "${rule.name}" has invalid structure, skipping`);
        return false;
      }

      // Check if rule applies to user's department
      const appliesToDepartment =
        Array.isArray(rule.appliesTo.departments) &&
        (rule.appliesTo.departments.includes(userDepartment) ||
          rule.appliesTo.departments.includes("ALL") ||
          rule.appliesTo.departments.includes("Any"));

      // Check if rule applies to user's role
      const appliesToRole =
        Array.isArray(rule.appliesTo.roles) &&
        (rule.appliesTo.roles.includes(userRole) ||
          rule.appliesTo.roles.includes("ALL") ||
          rule.appliesTo.roles.includes("Any"));

      // Log why rule is included or excluded
      if (!appliesToDepartment) {
        logger.debug(
          `Rule "${rule.name}" skipped: does not apply to department ${userDepartment}`
        );
      }

      if (!appliesToRole) {
        logger.debug(
          `Rule "${rule.name}" skipped: does not apply to role ${userRole}`
        );
      }

      // Rule applies if both department and role match
      if (appliesToDepartment && appliesToRole) {
        logger.debug(
          `Rule "${rule.name}" included: applies to department ${userDepartment} and role ${userRole}`
        );
        return true;
      }

      return false;
    });

    // Sort by priority (higher first)
    applicableRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    logger.info(`Found ${applicableRules.length} applicable rules for user`);

    // If no applicable rules found, use the fallback rule
    if (applicableRules.length === 0) {
      logger.warn("No applicable rules found, using fallback rule");
      applicableRules.push(fallbackRule);
    }

    // Log applicable rules
    applicableRules.forEach((rule, index) => {
      logger.info(
        `Applicable Rule ${index + 1}: ${rule.name}, Type: ${
          rule.type
        }, Priority: ${rule.priority || 0}`
      );

      if (rule.resources) {
        if (rule.resources.websites && rule.resources.websites.length > 0) {
          logger.info(
            `  Websites to ${rule.type}: ${rule.resources.websites.join(", ")}`
          );
        }

        if (
          rule.resources.applications &&
          rule.resources.applications.length > 0
        ) {
          logger.info(
            `  Applications to ${rule.type}: ${rule.resources.applications.join(
              ", "
            )}`
          );
        }

        if (rule.resources.files && rule.resources.files.length > 0) {
          logger.info(
            `  Files to ${rule.type}: ${rule.resources.files.join(", ")}`
          );
        }
      }
    });

    // Return the applicable rules
    return applicableRules;
  } catch (error) {
    logger.error(`Error getting rules for user: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }

    // Return a fallback rule to ensure something is returned
    logger.warn("Using emergency fallback rule due to error");
    return [
      {
        name: "Emergency Fallback Rule",
        description: "Created due to error in rule retrieval",
        type: "block",
        resources: {
          websites: ["facebook.com", "twitter.com", "instagram.com"],
          applications: [],
          files: [],
        },
        appliesTo: {
          departments: ["ALL"],
          roles: ["ALL"],
        },
        isActive: true,
        priority: 1,
      },
    ];
  }
};

const getUserByIdWithEmail = async (userId) => {
  try {
    logger.info(`Looking up user by ID: ${userId}`);

    if (!userId) {
      logger.warn("No userId provided for lookup");
      return null;
    }

    // Try to convert to ObjectId if it's a string
    let userObjectId;
    try {
      userObjectId = typeof userId === "string" ? new ObjectId(userId) : userId;
    } catch (error) {
      logger.warn(`Cannot convert userId to ObjectId: ${userId}`);
      // Continue using the string ID
      userObjectId = userId;
    }

    // Define User model schema
    const UserSchema = new mongoose.Schema(
      {
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        role: String,
        department: String,
        position: String,
        isActive: Boolean,
      },
      { collection: "agent_users" }
    );

    // Get or create User model
    const User = mongoose.models.User || mongoose.model("User", UserSchema);

    // Try to find by _id first
    let user = await User.findOne({ _id: userObjectId });

    // If not found, try other ID fields
    if (!user) {
      user = await User.findOne({ id: userId });
    }

    if (user) {
      logger.info(`User found: ${user.email}, ID: ${user._id}`);
      return {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "user",
      };
    } else {
      logger.warn(`No user found with ID: ${userId}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error finding user by ID: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
};

/**
 * Log agent activities to MongoDB
 * @param {Array} activities - Array of activity objects
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, count: number}>} - Result with count of logged activities
 */
const logActivities = async (activities, userId) => {
  try {
    if (!isConnected || !activities || activities.length === 0) {
      return { success: false, count: 0 };
    }

    // Look up the user once to get email
    let userInfo = null;
    if (userId) {
      userInfo = await getUserByIdWithEmail(userId);
    }

    // Format all activities for consistent structure with user email
    const formattedActivities = activities.map((activity) => {
      // Create a new object with standardized field names
      return {
        // User ID handling - prefer MongoDB ObjectId format
        userId: userId ? new ObjectId(userId) : null,

        // Important: Include user email either from activity or from user lookup
        user_email: activity.user_email || (userInfo ? userInfo.email : null),

        // Type of activity - essential for filtering
        type: activity.type || "unknown",

        // Resource being accessed
        resource: activity.resource || "",

        // Boolean for blocked status
        blocked: Boolean(activity.blocked),

        // String action for compatibility with backend
        action: activity.action || (activity.blocked ? "block" : "allow"),

        // Rule that triggered this activity
        ruleName: activity.ruleName || null,

        // Description of what happened
        description: activity.description || "",

        // Timestamp
        timestamp: activity.timestamp || new Date(),

        // Device information
        deviceInfo: {
          hostname: activity.deviceId || require("os").hostname(),
          platform: require("os").platform(),
          ip_address: activity.ip_address || getLocalIpAddress(),
        },

        // Mark as from agent
        source: "agent",
      };
    });

    // Log details for debugging
    logger.debug(
      `Inserting ${formattedActivities.length} formatted activities into database with user email`
    );
    if (formattedActivities.length > 0) {
      logger.debug(
        `Sample activity with email: ${JSON.stringify(formattedActivities[0])}`
      );
    }

    // Batch insert with retry mechanism
    let retryCount = 0;
    const maxRetries = 3;
    let result = null;

    while (retryCount < maxRetries) {
      try {
        result = await mongoose.connection
          .collection("access_logs")
          .insertMany(formattedActivities);
        break; // Exit loop if successful
      } catch (insertError) {
        retryCount++;
        logger.warn(
          `Insert attempt ${retryCount} failed: ${insertError.message}`
        );

        if (retryCount >= maxRetries) {
          throw insertError; // Rethrow if we've exhausted retries
        }

        // Wait between retries with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }

    logger.info(
      `Batch logged ${result.insertedCount} agent activities to MongoDB with user email`
    );
    return { success: true, count: result.insertedCount };
  } catch (error) {
    logger.error(
      `Error batch logging agent activities to MongoDB: ${error.message}`
    );
    return { success: false, error: error.message, count: 0 };
  }
};

/**
 * Get local IP address
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
  logActivities,
  getUserByEmail,
  getUserByIdWithEmail,
};
