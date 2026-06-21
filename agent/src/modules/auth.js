const axios = require("axios");
const mongoDbDirect = require("./mongoDbDirect");
const logger = require("../main/logger");

// Login function
const login = async (credentials, apiUrl) => {
  try {
    logger.info(`Attempting login for user: ${credentials.email}`);

    // Try to use the dedicated Agent API endpoint first
    try {
      logger.info(
        `Attempting Agent API authentication for: ${credentials.email}`
      );
      const response = await axios.post(
        `${apiUrl}/agent/auth/login`,
        {
          email: credentials.email,
          password: credentials.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data.success && response.data.token) {
        logger.info(
          `Agent API login successful for user: ${credentials.email}`
        );

        const userData = response.data.user;
        // Format user data to match what the app expects
        const user = {
          id: userData._id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          department: userData.department || "",
          position: userData.position || "",
        };

        return {
          success: true,
          token: response.data.token,
          user: user,
        };
      }
    } catch (error) {
      // Check for API error responses
      if (error.response) {
        logger.error(
          `Agent API login error: ${error.response.status} - ${JSON.stringify(
            error.response.data || {}
          )}`
        );
      } else {
        logger.error(`Agent API login error: ${error.message}`);
      }

      // Continue to next authentication method
      logger.info(
        "Failed to authenticate via Agent API, falling back to MongoDB direct authentication"
      );
    }

    // Use direct MongoDB authentication as a fallback
    return await authenticateDirectly(credentials, null);
  } catch (error) {
    logger.error(`Unexpected login error: ${error.message}`);
    return {
      success: false,
      error: "An unexpected error occurred during login. Please try again.",
    };
  }
};

// Function to validate token
const validateToken = async (token, apiUrl) => {
  try {
    // Check token by making a request to an API endpoint
    // For the Agent API, we can use any endpoint that requires authentication
    const response = await axios.get(`${apiUrl}/agent/statistics`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.status === 200;
  } catch (error) {
    logger.error(`Token validation error: ${error.message}`);
    return false;
  }
};

// MongoDB-direct authentication method - for direct DB connection
const authenticateDirectly = async (credentials, mongoUri) => {
  try {
    logger.info(
      `Attempting direct MongoDB authentication for user: ${credentials.email}`
    );

    // Use the mongoUri from parameter, or use the global one from config if not provided
    const uri = mongoUri || require("../main/main").config.mongoUri;

    // Connect to MongoDB using the zero_trust_db database
    const connected = await mongoDbDirect.connect(uri, "zero_trust_db");
    if (!connected) {
      return {
        success: false,
        error: "Failed to connect to database",
      };
    }

    // Use the direct authentication method from mongoDbDirect
    const result = await mongoDbDirect.authenticateUser(
      credentials.email,
      credentials.password
    );

    // If authentication is successful, get the rules for the user
    if (result.success) {
      logger.info(
        `Successfully authenticated user ${credentials.email} directly with MongoDB`
      );
      logger.info(`User ID: ${result.user.id}`);
    }

    return result;
  } catch (error) {
    logger.error(`Direct authentication error: ${error.message}`);
    return {
      success: false,
      error: `Authentication failed: ${error.message}`,
    };
  }
};

module.exports = {
  login,
  validateToken,
  authenticateDirectly,
  disconnectFromMongo: mongoDbDirect.disconnect,
};
