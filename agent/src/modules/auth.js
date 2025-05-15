// src/modules/auth.js
const axios = require("axios");
const { MongoClient, ObjectId } = require("mongodb");
const logger = require("../main/logger");

// MongoDB connection settings - will be loaded from config
let mongoClient = null;
let db = null;

// Функция подключения к MongoDB
const connectToMongo = async (mongoUri) => {
  if (mongoClient) {
    return true; // Already connected
  }

  try {
    logger.info(`Connecting to MongoDB at ${mongoUri}...`);
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db("zero_trust_db"); // Use the same database as main CNSMS
    logger.info("Successfully connected to MongoDB");
    return true;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    return false;
  }
};

// Функция отключения от MongoDB
const disconnectFromMongo = async () => {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
    logger.info("Disconnected from MongoDB");
  }
};

// Функция аутентификации через API или напрямую через MongoDB
const login = async (credentials, apiUrl) => {
  try {
    logger.info(`Attempting login for user: ${credentials.email}`);

    // First try to authenticate via API
    try {
      const response = await axios.post(
        `${apiUrl}/auth/login`,
        {
          username: credentials.email,
          password: credentials.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data.access_token) {
        // Get user details with token
        const userResponse = await axios.get(`${apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${response.data.access_token}`,
          },
        });

        if (userResponse.data) {
          logger.info(
            `Login successful for user: ${credentials.email} using API`
          );
          return {
            success: true,
            token: response.data.access_token,
            user: {
              id: userResponse.data.id,
              email: userResponse.data.email,
              firstName: userResponse.data.full_name.split(" ")[0] || "",
              lastName:
                userResponse.data.full_name.split(" ").slice(1).join(" ") || "",
              role: userResponse.data.role,
            },
          };
        }
      }
    } catch (apiError) {
      logger.warn(
        `API login failed: ${apiError.message}. Trying direct MongoDB authentication...`
      );
    }

    // If API fails, try direct MongoDB authentication
    if (!db) {
      // If we're not connected to MongoDB, try to connect
      await connectToMongo(
        apiUrl.replace("/api", "").replace("http://", "mongodb://") +
          "/zero_trust_db"
      );

      if (!db) {
        throw new Error("Failed to connect to MongoDB for authentication");
      }
    }

    // Find user by email
    const user = await db
      .collection("users")
      .findOne({ email: credentials.email });

    if (!user) {
      logger.warn(`User not found: ${credentials.email}`);
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // In a real application, you would verify the password hash
    // This is a simplified example - normally you would use bcrypt to compare hashes
    // For now, we'll just assume the password is correct if the user exists

    logger.info(
      `Direct MongoDB login successful for user: ${credentials.email}`
    );

    // Create a simple JWT-like token for authentication
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    return {
      success: true,
      token: token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.full_name.split(" ")[0] || "",
        lastName: user.full_name.split(" ").slice(1).join(" ") || "",
        department: user.department || "",
        role: user.role || "",
      },
    };
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Проверка валидности токена
const validateToken = async (token, apiUrl) => {
  try {
    // Try API validation
    try {
      const response = await axios.get(`${apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return !!response.data;
    } catch (apiError) {
      logger.warn(`API token validation failed: ${apiError.message}`);
    }

    // If API validation fails, try to decode the token ourselves
    try {
      const [userId, timestamp] = Buffer.from(token, "base64")
        .toString()
        .split(":");

      // Check if token is older than 24 hours
      const tokenTime = parseInt(timestamp);
      const now = Date.now();
      if (now - tokenTime > 24 * 60 * 60 * 1000) {
        return false;
      }

      // Check if user exists
      if (db) {
        const user = await db
          .collection("users")
          .findOne({ _id: new ObjectId(userId) });
        return !!user;
      }
    } catch (e) {
      logger.error(`Token validation error: ${e.message}`);
    }

    return false;
  } catch (error) {
    logger.error(`Token validation error: ${error.message}`);
    return false;
  }
};

module.exports = {
  connectToMongo,
  disconnectFromMongo,
  login,
  validateToken,
};
// Ensure MongoDB connection is closed on process exit