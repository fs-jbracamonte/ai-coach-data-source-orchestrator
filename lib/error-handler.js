/**
 * Centralized Error Handler for Data Source Orchestrator
 * 
 * Provides consistent error handling across all scripts with:
 * - Structured error logging
 * - User-friendly error messages
 * - Resolution steps for known errors
 * - Appropriate exit codes for different error types
 */

const {
  BaseError,
  ConfigurationError,
  DatabaseConnectionError,
  JiraAPIError,
  GoogleDriveError,
  FileSystemError,
  ValidationError,
  NetworkError
} = require('./errors');

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

/**
 * Check if running in a terminal that supports colors
 */
function supportsColor() {
  return process.stdout.isTTY && process.env.TERM !== 'dumb';
}

/**
 * Apply color to text if terminal supports it
 */
function colorize(text, color) {
  if (!supportsColor()) {
    return text;
  }
  return `${color}${text}${colors.reset}`;
}

/**
 * Format error message with context
 * @param {Error} error - The error object
 * @param {Object} context - Additional context information
 * @returns {string} Formatted error message
 */
function formatErrorMessage(error, context = {}) {
  const lines = [];
  
  // Header
  lines.push('');
  lines.push(colorize('═'.repeat(80), colors.red));
  lines.push(colorize(`ERROR: ${error.name}`, colors.bold + colors.red));
  lines.push(colorize('═'.repeat(80), colors.red));
  lines.push('');
  
  // Error message
  lines.push(colorize('Message:', colors.bold));
  lines.push(`  ${error.message}`);
  lines.push('');
  
  // Context information
  if (context.module) {
    lines.push(colorize('Module:', colors.bold));
    lines.push(`  ${context.module}`);
    lines.push('');
  }
  
  if (context.operation) {
    lines.push(colorize('Operation:', colors.bold));
    lines.push(`  ${context.operation}`);
    lines.push('');
  }
  
  if (context.configFile) {
    lines.push(colorize('Config File:', colors.bold));
    lines.push(`  ${context.configFile}`);
    lines.push('');
  }
  
  // Additional error context
  if (error.context && Object.keys(error.context).length > 0) {
    lines.push(colorize('Additional Context:', colors.bold));
    Object.entries(error.context).forEach(([key, value]) => {
      if (key !== 'resolutionSteps') {
        lines.push(`  ${key}: ${value}`);
      }
    });
    lines.push('');
  }
  
  // Resolution steps for known errors
  if (error.resolutionSteps && error.resolutionSteps.length > 0) {
    lines.push(colorize('Resolution Steps:', colors.bold + colors.cyan));
    error.resolutionSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
    lines.push('');
  }
  
  // Stack trace (only in development/debug mode)
  if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
    lines.push(colorize('Stack Trace:', colors.bold + colors.gray));
    const stackLines = error.stack.split('\n').slice(1); // Skip first line (already shown)
    stackLines.forEach(line => {
      lines.push(colorize(`  ${line.trim()}`, colors.gray));
    });
    lines.push('');
  } else {
    lines.push(colorize('Tip: Set DEBUG=true or NODE_ENV=development to see full stack trace', colors.gray));
    lines.push('');
  }
  
  lines.push(colorize('─'.repeat(80), colors.red));
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Log error details to a file for debugging
 * @param {Error} error - The error object
 * @param {Object} context - Additional context information
 */
function logErrorToFile(error, context = {}) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `error-${timestamp}.log`);
    
    const logData = {
      timestamp: new Date().toISOString(),
      error: error instanceof BaseError ? error.toJSON() : {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        configFile: process.env.CONFIG_FILE
      }
    };
    
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.error(colorize(`Error details logged to: ${logFile}`, colors.gray));
  } catch (logError) {
    // Silently fail if we can't write the log file
    // Don't want logging errors to mask the original error
  }
}

/**
 * Get appropriate exit code for error type
 * @param {Error} error - The error object
 * @returns {number} Exit code
 */
function getExitCode(error) {
  if (error.exitCode) {
    return error.exitCode;
  }
  
  // Map error types to exit codes
  if (error instanceof ConfigurationError) return 1;
  if (error instanceof DatabaseConnectionError) return 2;
  if (error instanceof JiraAPIError) return 3;
  if (error instanceof GoogleDriveError) return 4;
  if (error instanceof FileSystemError) return 5;
  if (error instanceof ValidationError) return 6;
  if (error instanceof NetworkError) return 7;
  
  // Default exit code for unknown errors
  return 1;
}

/**
 * Main error handler function
 * 
 * @param {Error} error - The error to handle
 * @param {Object} context - Additional context about where/when the error occurred
 * @param {string} context.module - Name of the module where error occurred (e.g., 'jira', 'daily-reports')
 * @param {string} context.operation - Operation being performed (e.g., 'export-to-csv', 'db-query')
 * @param {string} context.configFile - Config file being used
 * @param {boolean} options.exit - Whether to exit the process (default: true)
 * @param {boolean} options.logToFile - Whether to log error to file (default: true in production)
 * @returns {void}
 */
function handleError(error, context = {}, options = {}) {
  const {
    exit = true,
    logToFile = process.env.NODE_ENV === 'production' || process.env.LOG_ERRORS === 'true'
  } = options;
  
  // Add config file to context if not already present
  if (!context.configFile && process.env.CONFIG_FILE) {
    context.configFile = process.env.CONFIG_FILE;
  }
  
  // Format and display error message
  const errorMessage = formatErrorMessage(error, context);
  console.error(errorMessage);
  
  // Log to file if enabled
  if (logToFile) {
    logErrorToFile(error, context);
  }
  
  // Exit with appropriate code if requested
  if (exit) {
    const exitCode = getExitCode(error);
    process.exit(exitCode);
  }
}

/**
 * Wrap an async function with error handling
 * Useful for main() functions in scripts
 * 
 * @param {Function} fn - Async function to wrap
 * @param {Object} context - Context to pass to error handler
 * @returns {Function} Wrapped function
 * 
 * @example
 * const main = wrapAsync(async () => {
 *   // Your code here
 * }, { module: 'jira', operation: 'export' });
 * 
 * if (require.main === module) {
 *   main();
 * }
 */
function wrapAsync(fn, context = {}) {
  return async function(...args) {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error, context);
    }
  };
}

/**
 * Create error from native error with additional context
 * Useful for wrapping errors from third-party libraries
 * 
 * @param {Error} nativeError - Original error from library
 * @param {string} type - Type of custom error to create
 * @param {Object} context - Additional context
 * @returns {BaseError} Custom error instance
 */
function createErrorFromNative(nativeError, type, context = {}) {
  const ErrorClass = {
    'config': ConfigurationError,
    'database': DatabaseConnectionError,
    'jira': JiraAPIError,
    'drive': GoogleDriveError,
    'filesystem': FileSystemError,
    'validation': ValidationError,
    'network': NetworkError
  }[type] || BaseError;
  
  const error = new ErrorClass(nativeError.message, context);
  error.originalError = nativeError;
  error.stack = nativeError.stack;
  
  return error;
}

module.exports = {
  handleError,
  wrapAsync,
  createErrorFromNative,
  formatErrorMessage,
  getExitCode
};
