/**
 * Custom Error Classes for Data Source Orchestrator
 * 
 * These error classes extend the base Error class to provide:
 * - Specific error types for different failure scenarios
 * - Context information for debugging
 * - Structured error logging
 * - User-friendly error messages with resolution steps
 */

/**
 * Base class for all custom errors
 * Provides common functionality for error context and JSON serialization
 */
class BaseError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for structured logging
   * @returns {Object} Serialized error object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * ConfigurationError - Invalid or missing configuration
 * 
 * Thrown when:
 * - Config file is missing or malformed
 * - Required config fields are missing
 * - Config values fail validation
 * - Date ranges are invalid
 */
class ConfigurationError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.exitCode = 1;
    this.recoverable = true;
    
    // Default resolution steps
    this.resolutionSteps = context.resolutionSteps || [
      'Check your configuration file for syntax errors',
      'Ensure all required fields are present',
      'Verify date formats (YYYY-MM-DD)',
      'See config.example.jsonc for reference',
      'Review docs/CONFIG_VALIDATION.md for detailed validation rules'
    ];
  }
}

/**
 * DatabaseConnectionError - SSH tunnel or database connection failures
 * 
 * Thrown when:
 * - SSH tunnel cannot be established
 * - Private key file is missing or invalid
 * - Database credentials are incorrect
 * - Connection times out
 */
class DatabaseConnectionError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.exitCode = 2;
    this.recoverable = true;
    
    // Default resolution steps
    this.resolutionSteps = context.resolutionSteps || [
      'Verify SSH credentials in .env file',
      'Check that SSH_PRIVATE_KEY_PATH points to a valid key file',
      'Ensure the remote host is accessible',
      'Verify database credentials (DB_USER, DB_PASSWORD, DB_DATABASE)',
      'Check that DB_HOST is "localhost" when using SSH tunnel',
      'Verify the remote database is running'
    ];
  }
}

/**
 * JiraAPIError - Jira API connection or authentication failures
 * 
 * Thrown when:
 * - Jira API authentication fails (401)
 * - Jira API rate limits exceeded (429)
 * - Network connectivity issues
 * - Invalid project key or JQL query
 */
class JiraAPIError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.statusCode = context.statusCode;
    this.exitCode = 3;
    this.recoverable = true;
    
    // Status-specific resolution steps
    if (this.statusCode === 401) {
      this.resolutionSteps = [
        'Check JIRA_EMAIL in .env file',
        'Verify JIRA_API_TOKEN is valid and not expired',
        'Generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens',
        'Ensure the API token has appropriate permissions'
      ];
    } else if (this.statusCode === 404) {
      this.resolutionSteps = [
        'Verify the Jira project key in config file',
        'Ensure config.jira.host is the correct Jira instance',
        'Check that the project exists and you have access to it'
      ];
    } else if (this.statusCode === 429) {
      this.resolutionSteps = [
        'Jira API rate limit exceeded',
        'Wait a few minutes before retrying',
        'Consider reducing the date range in your query',
        'Check if other processes are making Jira API calls'
      ];
    } else {
      this.resolutionSteps = context.resolutionSteps || [
        'Verify JIRA_EMAIL and JIRA_API_TOKEN in .env file',
        'Check that config.jira.host is correct (domain only, no protocol)',
        'Ensure the Jira instance is accessible',
        'Verify the project key exists',
        'Check network connectivity'
      ];
    }
  }
}

/**
 * GoogleDriveError - Google Drive API access failures
 * 
 * Thrown when:
 * - Service account credentials are invalid
 * - Folder ID doesn't exist or is inaccessible
 * - Permission denied (403)
 * - Network connectivity issues
 */
class GoogleDriveError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.statusCode = context.statusCode;
    this.exitCode = 4;
    this.recoverable = true;
    
    // Status-specific resolution steps
    if (this.statusCode === 403) {
      this.resolutionSteps = [
        'Check service account permissions for the Google Drive folder',
        'Share the folder with the service account email (found in service-account-key.json)',
        'Ensure the service account has "Viewer" or higher permissions',
        'Verify the folder ID is correct in config file'
      ];
    } else if (this.statusCode === 404) {
      this.resolutionSteps = [
        'Verify the Google Drive folder ID in config file',
        'Ensure the folder exists and is not in trash',
        'Check that the folder ID format is correct (alphanumeric string)'
      ];
    } else {
      this.resolutionSteps = context.resolutionSteps || [
        'Verify service-account-key.json exists and is valid',
        'Check config.transcripts.serviceAccountKeyFile path',
        'Ensure folder IDs are correct in config file',
        'Share folders with service account email',
        'Verify network connectivity to Google Drive API'
      ];
    }
  }
}

/**
 * FileSystemError - File read/write or directory access failures
 * 
 * Thrown when:
 * - Cannot read/write files
 * - Directory creation fails
 * - File not found when expected
 * - Permission denied
 */
class FileSystemError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.exitCode = 5;
    this.recoverable = true;
    
    // Operation-specific resolution steps
    const operation = context.operation;
    if (operation === 'read' && message.includes('not found')) {
      this.resolutionSteps = [
        'Run npm run clean to reset output directories',
        'Ensure prerequisite scripts have been run',
        'Check that the file path is correct',
        'Verify the file was created by previous steps'
      ];
    } else if (operation === 'write' || operation === 'mkdir') {
      this.resolutionSteps = [
        'Check file/directory permissions',
        'Ensure you have write access to the target directory',
        'Verify disk space is available',
        'Check that the path is not too long (Windows limitation)'
      ];
    } else {
      this.resolutionSteps = context.resolutionSteps || [
        'Check file and directory permissions',
        'Ensure all required directories exist',
        'Verify file paths are correct',
        'Run npm run clean to reset output directories'
      ];
    }
  }
}

/**
 * ValidationError - Data or input validation failures
 * 
 * Thrown when:
 * - CSV data is malformed
 * - Required data fields are missing
 * - Data format is invalid
 */
class ValidationError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.exitCode = 6;
    this.recoverable = true;
    
    this.resolutionSteps = context.resolutionSteps || [
      'Check the input data format',
      'Verify all required fields are present',
      'Ensure data types are correct',
      'Review the data source for completeness'
    ];
  }
}

/**
 * NetworkError - General network connectivity failures
 * 
 * Thrown when:
 * - Network request times out
 * - Host is unreachable
 * - DNS resolution fails
 */
class NetworkError extends BaseError {
  constructor(message, context = {}) {
    super(message, context);
    this.exitCode = 7;
    this.recoverable = true;
    
    this.resolutionSteps = context.resolutionSteps || [
      'Check your internet connection',
      'Verify the host is accessible',
      'Check for firewall or proxy restrictions',
      'Try again in a few moments'
    ];
  }
}

module.exports = {
  BaseError,
  ConfigurationError,
  DatabaseConnectionError,
  JiraAPIError,
  GoogleDriveError,
  FileSystemError,
  ValidationError,
  NetworkError
};
