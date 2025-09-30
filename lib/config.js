const fs = require('fs');
const path = require('path');

/**
 * ConfigManager - Singleton class for loading and managing configuration files
 * 
 * This class provides centralized configuration management with:
 * - Singleton pattern to cache loaded config
 * - Environment variable support (CONFIG_FILE)
 * - File existence checking with helpful error messages
 * - Reload capability for testing purposes
 */
class ConfigManager {
  constructor() {
    this._config = null;
    this._configPath = null;
  }

  /**
   * Load the configuration file
   * Uses CONFIG_FILE environment variable or defaults to 'config.json'
   * Returns cached config if already loaded
   * 
   * @returns {Object} The parsed configuration object
   * @throws {Error} If config file doesn't exist or cannot be parsed
   */
  static load() {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    return ConfigManager._instance._load();
  }

  /**
   * Reload the configuration file (useful for testing)
   * Clears the cache and loads the config again
   * 
   * @returns {Object} The parsed configuration object
   */
  static reload() {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    ConfigManager._instance._config = null;
    ConfigManager._instance._configPath = null;
    return ConfigManager._instance._load();
  }

  /**
   * Get the current config path without loading
   * 
   * @returns {string|null} The current config path or null if not loaded
   */
  static getConfigPath() {
    if (!ConfigManager._instance) {
      return null;
    }
    return ConfigManager._instance._configPath;
  }

  /**
   * Internal load method
   * @private
   */
  _load() {
    // Return cached config if already loaded
    if (this._config) {
      return this._config;
    }

    // Get config file path from environment or use default
    const configFile = process.env.CONFIG_FILE || 'config.json';
    const configPath = path.resolve(process.cwd(), configFile);

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Configuration file not found: ${configPath}\n\n` +
        `Please ensure one of the following:\n` +
        `  1. Create a 'config.json' file in the project root\n` +
        `  2. Copy 'config.example.jsonc' to 'config.json' and customize it\n` +
        `  3. Set the CONFIG_FILE environment variable to point to your config file\n\n` +
        `Example: CONFIG_FILE=config.project1.json npm run daily:query`
      );
    }

    // Load and parse the configuration
    try {
      console.log(`Using config file: ${configPath}`);
      this._configPath = configPath;
      
      // Use require to load the config (supports JSON and JS files)
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(configPath)];
      this._config = require(configPath);
      
      return this._config;
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          `Configuration file not found: ${configPath}\n` +
          `Error: ${error.message}`
        );
      }
      
      throw new Error(
        `Failed to parse configuration file: ${configPath}\n` +
        `Error: ${error.message}\n\n` +
        `Please ensure the configuration file is valid JSON or JavaScript.`
      );
    }
  }

  /**
   * Clear the singleton instance (for testing purposes)
   * @private
   */
  static _clearInstance() {
    ConfigManager._instance = null;
  }
}

// Singleton instance
ConfigManager._instance = null;

// Export the ConfigManager class and convenience methods
module.exports = {
  ConfigManager,
  load: () => ConfigManager.load(),
  reload: () => ConfigManager.reload(),
  getConfigPath: () => ConfigManager.getConfigPath()
};
