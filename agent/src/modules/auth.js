const axios = require("axios");
const mongoose = require("mongoose");
const logger = require("../main/logger");

// Connect to MongoDB
const connectToMongo = async (mongoUri) => {
  try {
    if (mongoose.connection.readyState === 1) {
      logger.info("Already connected to MongoDB");
      return true;
    }

    // Make sure URI doesn't end with a slash
    const uri = mongoUri.endsWith("/") ? mongoUri.slice(0, -1) : mongoUri;

    logger.info(`Connecting to MongoDB using URI: ${uri}`);

    // Set mongoose options to handle deprecation warnings
    mongoose.set("strictQuery", false);

    // Add connection options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    try {
      await mongoose.connect(uri, options);
      logger.info("Connected to MongoDB successfully");

      // Log database name
      logger.info(
        `Connected to database: ${mongoose.connection.name || "unknown"}`
      );

      return true;
    } catch (error) {
      logger.error(`MongoDB connection error: ${error.message}`);
      return false;
    }
  } catch (error) {
    logger.error(`Unexpected MongoDB connection error: ${error.message}`);
    return false;
  }
};

// Disconnect from MongoDB
const disconnectFromMongo = async () => {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info("Disconnected from MongoDB");
    } catch (error) {
      logger.error(`Error disconnecting from MongoDB: ${error.message}`);
    }
  }
};

// Login function
const login = async (credentials, apiUrl) => {
  try {
    logger.info(`Attempting login for user: ${credentials.email}`);

    // Since we're using a direct login through the REST API,
    // we can use any API-based authentication here
    try {
      const response = await axios.post(
        `${apiUrl}/auth/token`,
        new URLSearchParams({
          username: credentials.email,
          password: credentials.password,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (response.data && response.data.access_token) {
        // Get user details using the token
        const userResponse = await axios.get(`${apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${response.data.access_token}`,
          },
        });

        if (userResponse.data) {
          logger.info(`Login successful for user: ${credentials.email}`);

          // Create a proper user object from the response
          const user = {
            id: userResponse.data.id,
            email: userResponse.data.email,
            firstName: userResponse.data.full_name
              ? userResponse.data.full_name.split(" ")[0]
              : "",
            lastName: userResponse.data.full_name
              ? userResponse.data.full_name.split(" ").slice(1).join(" ")
              : "",
            role: userResponse.data.role,
            department: userResponse.data.department || "",
            originalUser: userResponse.data,
          };

          // Log user details for debugging
          logger.debug(`User details: ${JSON.stringify(user)}`);

          return {
            success: true,
            token: response.data.access_token,
            user: user,
          };
        }
      }

      logger.warn(`Login failed for user: ${credentials.email}`);
      return {
        success: false,
        error: "Authentication failed",
      };
    } catch (error) {
      // Check for API error responses
      if (error.response) {
        logger.error(
          `API error: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );

        // If the API returns a specific error message, use it
        if (error.response.data && error.response.data.detail) {
          return {
            success: false,
            error: error.response.data.detail,
          };
        }
      }

      // Generic error handling
      logger.error(`Login error: ${error.message}`);
      return {
        success: false,
        error:
          "Cannot connect to authentication server. Please check your network connection.",
      };
    }
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
    // Check token by making a request to the me endpoint
    const response = await axios.get(`${apiUrl}/auth/me`, {
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

    // Connect to MongoDB first
    const connected = await connectToMongo(mongoUri);
    if (!connected) {
      return {
        success: false,
        error: "Failed to connect to database",
      };
    }

    // Find user by email
    const User = mongoose.model(
      "User",
      new mongoose.Schema({
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        role: String,
        department: String,
      })
    );

    const user = await User.findOne({ email: credentials.email });
    if (!user) {
      logger.warn(`User not found: ${credentials.email}`);
      return {
        success: false,
        error: "User not found",
      };
    }

    // For testing, bypass password check - REMOVE IN PRODUCTION
    logger.warn("⚠️ BYPASSING PASSWORD CHECK - REMOVE THIS IN PRODUCTION ⚠️");

    // In production, check password hash (using bcrypt or similar)
    // const passwordMatch = await bcrypt.compare(credentials.password, user.password);
    const passwordMatch = true; // FOR TESTING ONLY

    if (!passwordMatch) {
      logger.warn(`Invalid password for user: ${credentials.email}`);
      return {
        success: false,
        error: "Invalid password",
      };
    }

    // Generate a simple token
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    logger.info(
      `Direct authentication successful for user: ${credentials.email}`
    );

    return {
      success: true,
      token: token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "user",
        department: user.department || "",
      },
    };
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
  connectToMongo,
  disconnectFromMongo,
  authenticateDirectly,
};
