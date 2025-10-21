const fs = require('fs');
const path = require('path');
const { configSchema } = require('../schemas/config.schema');
const validators = require('./validators');
const { ConfigurationError } = require('./errors');
const ALLOWED_REPORT_TYPES = ['1on1', 'team', 'weekly', 'dashboard'];

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
    this._mergedCache = new Map();
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
   * Load configuration for a specific team and report type using the
   * hierarchical config structure under configs/.
   *
   * Merge order (deep merge, arrays replaced):
   * 1) configs/shared/defaults.json (if exists)
   * 2) configs/{team}/config.json
   * 3) configs/{team}/config.{reportType}.json
   *
   * @param {string} team
   * @param {('1on1'|'team'|'weekly')} reportType
   * @returns {Object}
   */
  static loadForReportType(team, reportType) {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    return ConfigManager._instance._loadForReportType(team, reportType);
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
    ConfigManager._instance._mergedCache = new Map();
    return ConfigManager._instance._load();
  }

  /**
   * Clear all cached configurations (single-file and merged) - useful for tests
   */
  static clearCache() {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    ConfigManager._instance._config = null;
    ConfigManager._instance._configPath = null;
    ConfigManager._instance._mergedCache = new Map();
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

    // Validate reportType when provided
    if (value && value.reportType !== undefined) {
      if (!ALLOWED_REPORT_TYPES.includes(value.reportType)) {
        throw new ConfigurationError(
          `Invalid reportType: '${value.reportType}'. Allowed values are ${ALLOWED_REPORT_TYPES.join(', ')}.`,
          { configFile: this._configPath, reportType: value.reportType, allowed: ALLOWED_REPORT_TYPES }
        );
      }
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
    // If TEAM and REPORT_TYPE are provided, use hierarchical loader and skip single-file cache
    const envTeam = process.env.TEAM;
    const envReportType = process.env.REPORT_TYPE;
    if (envTeam && envReportType) {
      return this._loadForReportType(envTeam, envReportType);
    }

    // Return cached single-file config if already loaded
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
   * Internal: deep merge two config objects where arrays are replaced (not concatenated)
   * @param {Object} baseConfig
   * @param {Object} overrideConfig
   * @returns {Object}
   * @private
   */
  _mergeConfigs(baseConfig, overrideConfig) {
    if (!overrideConfig || typeof overrideConfig !== 'object') {
      return baseConfig;
    }
    if (!baseConfig || typeof baseConfig !== 'object') {
      // clone override
      return Array.isArray(overrideConfig) ? overrideConfig.slice() : { ...overrideConfig };
    }

    const result = Array.isArray(baseConfig) ? baseConfig.slice() : { ...baseConfig };
    for (const key of Object.keys(overrideConfig)) {
      const baseVal = result[key];
      const overrideVal = overrideConfig[key];
      if (Array.isArray(overrideVal)) {
        // arrays are replaced entirely
        result[key] = overrideVal.slice();
      } else if (
        overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal) &&
        baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)
      ) {
        result[key] = this._mergeConfigs(baseVal, overrideVal);
      } else {
        result[key] = overrideVal;
      }
    }
    return result;
  }

  /**
   * Internal: hierarchical load for a given team and reportType
   * @param {string} team
   * @param {('1on1'|'team'|'weekly')} reportType
   * @returns {Object}
   * @private
   */
  _loadForReportType(team, reportType) {
    if (typeof team !== 'string' || !team.trim()) {
      throw new ConfigurationError('TEAM must be a non-empty string.', { team });
    }
    if (!ALLOWED_REPORT_TYPES.includes(reportType)) {
      throw new ConfigurationError(
        `Invalid REPORT_TYPE: '${reportType}'. Allowed values are ${ALLOWED_REPORT_TYPES.join(', ')}.`,
        { team, reportType }
      );
    }

    const cacheKey = `${team}-${reportType}`;
    if (this._mergedCache.has(cacheKey)) {
      return this._mergedCache.get(cacheKey);
    }

    const configsDir = path.resolve(process.cwd(), 'configs');
    const teamDir = path.resolve(configsDir, team);
    const sharedDefaultsPath = path.resolve(configsDir, 'shared', 'defaults.json');
    const teamBasePath = path.resolve(teamDir, 'config.json');
    const reportOverridePath = path.resolve(teamDir, `config.${reportType}.json`);

    // Ensure team directory exists
    if (!fs.existsSync(teamDir)) {
      const availableTeams = fs.existsSync(configsDir)
        ? fs.readdirSync(configsDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name !== 'shared')
            .map(d => d.name)
        : [];
      throw new ConfigurationError(
        `Team directory not found: ${teamDir}. Available teams: ${availableTeams.join(', ') || '(none found)'}.`,
        { team, teamDir, availableTeams }
      );
    }

    // Load files (defaults optional, base+override required)
    const loadJson = (p) => {
      delete require.cache[require.resolve(p)];
      return require(p);
    };

    let defaults = {};
    if (fs.existsSync(sharedDefaultsPath)) {
      try {
        defaults = loadJson(sharedDefaultsPath);
      } catch (e) {
        throw new ConfigurationError(`Failed to parse shared defaults at ${sharedDefaultsPath}: ${e.message}`, { configFile: sharedDefaultsPath });
      }
    }

    if (!fs.existsSync(teamBasePath)) {
      throw new ConfigurationError(
        `Team base config not found: ${teamBasePath}.`,
        { team, configFile: teamBasePath }
      );
    }
    if (!fs.existsSync(reportOverridePath)) {
      throw new ConfigurationError(
        `Report override config not found: ${reportOverridePath}. Available report types: ${ALLOWED_REPORT_TYPES.join(', ')}.`,
        { team, reportType, configFile: reportOverridePath }
      );
    }

    let baseConfig;
    let reportConfig;
    try {
      baseConfig = loadJson(teamBasePath);
    } catch (e) {
      throw new ConfigurationError(`Failed to parse team base config at ${teamBasePath}: ${e.message}`, { configFile: teamBasePath });
    }
    try {
      reportConfig = loadJson(reportOverridePath);
    } catch (e) {
      throw new ConfigurationError(`Failed to parse report override at ${reportOverridePath}: ${e.message}`, { configFile: reportOverridePath });
    }

    // Merge in order: defaults -> base -> report
    let merged = this._mergeConfigs({}, defaults || {});
    merged = this._mergeConfigs(merged, baseConfig || {});
    merged = this._mergeConfigs(merged, reportConfig || {});

    // Note: set a descriptive path for context in validation errors
    this._configPath = `${teamBasePath} + ${reportOverridePath}${fs.existsSync(sharedDefaultsPath) ? ` (with ${sharedDefaultsPath})` : ''}`;

    // Validate merged config
    const validated = this._validateConfig(merged);

    // Cache and return
    this._mergedCache.set(cacheKey, validated);

    console.log(`Using hierarchical configs for team='${team}', reportType='${reportType}':`);
    if (fs.existsSync(sharedDefaultsPath)) console.log(`  - ${sharedDefaultsPath}`);
    console.log(`  - ${teamBasePath}`);
    console.log(`  - ${reportOverridePath}`);
    console.log('✓ Configuration validated successfully');

    return validated;
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
