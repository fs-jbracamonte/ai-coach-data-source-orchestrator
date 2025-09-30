#!/usr/bin/env node

/**
 * Test Script for Error Handling System
 * 
 * This script demonstrates and tests the centralized error handling system.
 * It simulates various error scenarios to verify error messages, context, and resolution steps.
 * 
 * Usage:
 *   node test-error-handling.js [error-type]
 * 
 * Error types:
 *   - config: Test ConfigurationError
 *   - database: Test DatabaseConnectionError
 *   - jira: Test JiraAPIError
 *   - drive: Test GoogleDriveError
 *   - filesystem: Test FileSystemError
 *   - validation: Test ValidationError
 *   - network: Test NetworkError
 *   - all: Test all error types (non-exit mode)
 */

const {
  ConfigurationError,
  DatabaseConnectionError,
  JiraAPIError,
  GoogleDriveError,
  FileSystemError,
  ValidationError,
  NetworkError
} = require('./lib/errors');

const { handleError } = require('./lib/error-handler');

// Test scenarios
const testScenarios = {
  config: {
    name: 'ConfigurationError',
    test: () => {
      throw new ConfigurationError(
        'Configuration file not found: /path/to/config.json',
        {
          configFile: '/path/to/config.json',
          resolutionSteps: [
            'Create a config.json file in the project root',
            'Copy config.example.jsonc to config.json',
            'Set CONFIG_FILE environment variable'
          ]
        }
      );
    }
  },

  database: {
    name: 'DatabaseConnectionError',
    test: () => {
      throw new DatabaseConnectionError(
        'SSH connection error: Authentication failed',
        {
          host: 'remote.example.com',
          port: 22,
          username: 'deploy',
          resolutionSteps: [
            'Verify SSH credentials in .env file',
            'Check that SSH_PRIVATE_KEY_PATH points to a valid key file',
            'Ensure the remote host is accessible',
            'Verify the private key has correct permissions (600)'
          ]
        }
      );
    }
  },

  jira: {
    name: 'JiraAPIError',
    test: () => {
      throw new JiraAPIError(
        'HTTP 401: Unauthorized',
        {
          statusCode: 401,
          host: 'company.atlassian.net',
          path: '/rest/api/2/search',
          resolutionSteps: [
            'Check JIRA_EMAIL in .env file',
            'Verify JIRA_API_TOKEN is valid and not expired',
            'Generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens',
            'Ensure the API token has appropriate permissions'
          ]
        }
      );
    }
  },

  drive: {
    name: 'GoogleDriveError',
    test: () => {
      throw new GoogleDriveError(
        'Error listing files in folder: Permission denied',
        {
          statusCode: 403,
          folderId: '1234567890abcdefghijklmnop',
          resolutionSteps: [
            'Check service account permissions for the Google Drive folder',
            'Share the folder with the service account email',
            'Ensure the service account has "Viewer" or higher permissions',
            'Verify the folder ID is correct in config file'
          ]
        }
      );
    }
  },

  filesystem: {
    name: 'FileSystemError',
    test: () => {
      throw new FileSystemError(
        'Failed to read private key: ENOENT: no such file or directory',
        {
          operation: 'read',
          path: '/path/to/private-key.pem',
          resolutionSteps: [
            'Verify SSH_PRIVATE_KEY_PATH in .env file is correct',
            'Check that the private key file exists',
            'Ensure you have read permissions for the key file',
            'Verify the path is absolute or relative to project root'
          ]
        }
      );
    }
  },

  validation: {
    name: 'ValidationError',
    test: () => {
      throw new ValidationError(
        'Invalid CSV format: Missing required column "employee_id"',
        {
          file: 'daily-reports.csv',
          missingColumns: ['employee_id'],
          resolutionSteps: [
            'Check the CSV file format',
            'Verify all required columns are present',
            'Ensure the column headers match expected names',
            'Re-run the database query to regenerate the CSV'
          ]
        }
      );
    }
  },

  network: {
    name: 'NetworkError',
    test: () => {
      throw new NetworkError(
        'Network request timeout: Connection timed out after 30000ms',
        {
          host: 'api.example.com',
          timeout: 30000,
          resolutionSteps: [
            'Check your internet connection',
            'Verify the host is accessible',
            'Check for firewall or proxy restrictions',
            'Try again in a few moments'
          ]
        }
      );
    }
  }
};

// Helper function to run a test
function runTest(errorType, exitOnError = true) {
  const scenario = testScenarios[errorType];
  
  if (!scenario) {
    console.error(`Unknown error type: ${errorType}`);
    console.error(`Available types: ${Object.keys(testScenarios).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nTesting: ${scenario.name}\n`);
  console.log('='.repeat(80));

  try {
    scenario.test();
  } catch (error) {
    handleError(error, {
      module: 'test-error-handling',
      operation: `test-${errorType}`,
      configFile: 'test-config.json'
    }, {
      exit: exitOnError,
      logToFile: false // Don't clutter logs directory with test errors
    });
  }
}

// Helper function to run all tests
function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('Running All Error Handling Tests');
  console.log('='.repeat(80));
  console.log('\nNote: Running in non-exit mode to show all error types\n');

  for (const errorType of Object.keys(testScenarios)) {
    runTest(errorType, false);
    console.log('\n');
  }

  console.log('='.repeat(80));
  console.log('All tests completed!');
  console.log('='.repeat(80));
  console.log('\nExit codes used by each error type:');
  console.log('  ConfigurationError: 1');
  console.log('  DatabaseConnectionError: 2');
  console.log('  JiraAPIError: 3');
  console.log('  GoogleDriveError: 4');
  console.log('  FileSystemError: 5');
  console.log('  ValidationError: 6');
  console.log('  NetworkError: 7');
  console.log('\nSet DEBUG=true to see full stack traces');
}

// Main execution
const args = process.argv.slice(2);
const errorType = args[0] || 'all';

if (errorType === 'all') {
  runAllTests();
} else if (errorType === 'help' || errorType === '--help' || errorType === '-h') {
  console.log(`
Usage: node test-error-handling.js [error-type]

Error types:
  config      - Test ConfigurationError
  database    - Test DatabaseConnectionError
  jira        - Test JiraAPIError
  drive       - Test GoogleDriveError
  filesystem  - Test FileSystemError
  validation  - Test ValidationError
  network     - Test NetworkError
  all         - Test all error types (default)
  help        - Show this help message

Examples:
  node test-error-handling.js config
  node test-error-handling.js jira
  DEBUG=true node test-error-handling.js database
  node test-error-handling.js all
  `);
} else {
  runTest(errorType, true);
}
