const winston = require("winston");
const path = require("path");
const { app } = require("electron");
const fs = require("fs");

// Log directory
let logDir;

// Logger initialization
let logger;

// Create log directory if it doesn't exist
const ensureLogDirectory = () => {
  try {
    logDir = path.join(app.getPath("userData"), "logs");

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    return logDir;
  } catch (error) {
    console.error(`Failed to create log directory: ${error.message}`);
    return path.join(__dirname, "../../logs");
  }
};

const init = (level = "info") => {
  // Create log directory
  const logDirectory = ensureLogDirectory();

  // Log formats
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  );

  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  );

  // Create logger
  logger = winston.createLogger({
    level,
    format: fileFormat,
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
      }),
      new winston.transports.File({
        filename: path.join(logDirectory, "error.log"),
        level: "error",
      }),
      new winston.transports.File({
        filename: path.join(logDirectory, "combined.log"),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ],
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise);
    logger.error("Reason:", reason);
  });

  logger.info("Logger initialized");
  return logger;
};

// Logging methods
const info = (message) => {
  if (logger) logger.info(message);
  else console.log(`INFO: ${message}`);
};

const error = (message) => {
  if (logger) logger.error(message);
  else console.error(`ERROR: ${message}`);
};

const warn = (message) => {
  if (logger) logger.warn(message);
  else console.warn(`WARN: ${message}`);
};

const debug = (message) => {
  if (logger) logger.debug(message);
  else console.debug(`DEBUG: ${message}`);
};

module.exports = {
  init,
  info,
  error,
  warn,
  debug,
};
