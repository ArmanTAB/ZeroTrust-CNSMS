const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const logger = require("./logger");

function clearAgentCache() {
  const fs = require("fs");
  const path = require("path");
  const { app } = require("electron");

  try {
    // Get the app data path
    const appDataPath = app.getPath("userData");
    console.log(`Clearing agent cache in: ${appDataPath}`);

    // Check if directory exists
    if (!fs.existsSync(appDataPath)) {
      console.log(`App data directory doesn't exist: ${appDataPath}`);
      return { success: false, message: "App data directory not found" };
    }

    // Get all files in the directory
    const files = fs.readdirSync(appDataPath);
    let deletedCount = 0;

    // Delete each file
    for (const file of files) {
      // Skip .gitkeep or other special files you want to preserve
      if (file === ".gitkeep" || file === ".DS_Store") continue;

      const filePath = path.join(appDataPath, file);

      try {
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          // For directories, delete all contents
          fs.rmSync(filePath, { recursive: true, force: true });
          console.log(`Deleted directory: ${file}`);
        } else {
          // For files, simply delete
          fs.unlinkSync(filePath);
          console.log(`Deleted file: ${file}`);
        }

        deletedCount++;
      } catch (fileError) {
        console.error(`Error deleting ${filePath}: ${fileError.message}`);
      }
    }

    console.log(`Successfully cleared ${deletedCount} files/directories`);
    return {
      success: true,
      message: `Cache cleared: ${deletedCount} items deleted from ${appDataPath}`,
    };
  } catch (error) {
    console.error(`Error clearing agent cache: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { clearAgentCache };
