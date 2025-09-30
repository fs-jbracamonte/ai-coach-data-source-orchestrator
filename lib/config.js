const fs = require('fs');
const path = require('path');
const { configSchema } = require('../schemas/config.schema');
const validators = require('./validators');
const { ConfigurationError } = require('./errors');

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
   * Validates configuration object against schema
   * @param {Object} config - The configuration object to validate
   * @throws {Error} If validation fails
   * @private
   */
  _validateConfig(config) {
    // Validate with Joi schema
    const { error, value } = configSchema.validate(config, {
      abortEarly: false, // Collect all errors, not just the first one
      allowUnknown: true // Allow extra fields for flexibility
    });

    if (error) {
      const errors = error.details.map(detail => {
        return `  - ${detail.path.join('.')}: ${detail.message}`;
      }).join('\n');
      
      throw new ConfigurationError(
        `Configuration validation failed:\n\n${errors}\n\n` +
        `Please check your configuration file and fix the errors above.\n` +
        `See config.example.jsonc for a complete example.`,
        {
          configFile: this._configPath,
          errors: error.details.map(d => ({ path: d.path.join('.'), message: d.message }))
        }
      );
    }

    // Additional runtime validation for date ranges
    try {
      if (config.dailyReports?.query) {
        validators.validateDateRange(
          config.dailyReports.query.report_date_start,
          config.dailyReports.query.report_date_end,
          'dailyReports'
        );
        validators.validateEmployeeId(config.dailyReports.query.employee_id);
      }

      if (config.jira) {
        validators.validateDateRange(
          config.jira.start_date,
          config.jira.end_date,
          'jira'
        );
        
        if (config.jira.host) {
          validators.validateJiraHost(config.jira.host);
        }
      }

      if (config.transcripts) {
        // Validate folder_ids or folderId
        if (config.transcripts.folder_ids) {
          validators.validateFolderIds(config.transcripts.folder_ids);
        } else if (config.transcripts.folderId) {
          // Handle both string and array formats
          if (Array.isArray(config.transcripts.folderId)) {
            validators.validateFolderIds(config.transcripts.folderId);
          } else {
            validators.validateFolderId(config.transcripts.folderId);
          }
        }

        // Validate date filter if enabled
        if (config.transcripts.dateFilter?.enabled) {
          validators.validateDateRange(
            config.transcripts.dateFilter.startDate,
            config.transcripts.dateFilter.endDate,
            'transcripts.dateFilter'
          );
        }
      }
    } catch (validationError) {
      throw new ConfigurationError(
        `Configuration validation failed:\n\n  ${validationError.message}\n\n` +
        `Please check your configuration file and fix the errors above.\n` +
        `See config.example.jsonc for a complete example.`,
        {
          configFile: this._configPath,
          originalError: validationError.message
        }
      );
    }

    return value;
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
      throw new ConfigurationError(
        `Configuration file not found: ${configPath}\n\n` +
        `Please ensure one of the following:\n` +
        `  1. Create a 'config.json' file in the project root\n` +
        `  2. Copy 'config.example.jsonc' to 'config.json' and customize it\n` +
        `  3. Set the CONFIG_FILE environment variable to point to your config file\n\n` +
        `Example: CONFIG_FILE=config.project1.json npm run daily:query`,
        {
          configFile: configPath,
          resolutionSteps: [
            "Create a 'config.json' file in the project root",
            "Copy 'config.example.jsonc' to 'config.json' and customize it",
            "Set the CONFIG_FILE environment variable to point to your config file"
          ]
        }
      );
    }

    // Load and parse the configuration
    try {
      console.log(`Using config file: ${configPath}`);
      this._configPath = configPath;
      
      // Use require to load the config (supports JSON and JS files)
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(configPath)];
      const rawConfig = require(configPath);
      
      // Validate the configuration
      this._config = this._validateConfig(rawConfig);
      
      console.log('✓ Configuration validated successfully');
      
      return this._config;
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new ConfigurationError(
          `Configuration file not found: ${configPath}\n` +
          `Error: ${error.message}`,
          { configFile: configPath }
        );
      }
      
      // If it's already a ConfigurationError, rethrow it
      if (error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(
        `Failed to parse configuration file: ${configPath}\n` +
        `Error: ${error.message}\n\n` +
        `Please ensure the configuration file is valid JSON or JavaScript.`,
        {
          configFile: configPath,
          parseError: error.message,
          resolutionSteps: [
            'Check for syntax errors in the configuration file',
            'Ensure the file is valid JSON or JavaScript',
            'Verify there are no trailing commas in JSON files',
            'Check that all quotes are properly closed'
          ]
        }
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
