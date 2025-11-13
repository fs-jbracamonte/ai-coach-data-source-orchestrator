# Error Handling System

This document describes the centralized error handling system used throughout the Data Source Orchestrator.

## Overview

The system provides:
- **Specific error types** for different failure scenarios
- **User-friendly error messages** with clear context
- **Actionable resolution steps** for common issues
- **Structured error logging** for debugging
- **Appropriate exit codes** for automation and scripting

## Error Types

All custom errors extend the base `Error` class and include additional context and resolution steps.

### 1. ConfigurationError (Exit Code: 1)

**When it occurs:**
- Config file is missing or malformed
- Required config fields are missing
- Config values fail validation
- Date ranges are invalid

**Example:**
```
ERROR: ConfigurationError

Message:
  Configuration file not found: D:\repo\config.json

Resolution Steps:
  1. Create a 'config.json' file in the project root
  2. Copy 'config.example.jsonc' to 'config.json' and customize it
  3. Set the CONFIG_FILE environment variable to point to your config file
```

### 2. DatabaseConnectionError (Exit Code: 2)

**When it occurs:**
- SSH tunnel cannot be established
- Private key file is missing or invalid
- Database credentials are incorrect
- Connection times out

**Example:**
```
ERROR: DatabaseConnectionError

Message:
  SSH connection error: Authentication failed

Resolution Steps:
  1. Verify SSH credentials in .env file
  2. Check that SSH_PRIVATE_KEY_PATH points to a valid key file
  3. Ensure the remote host is accessible
  4. Verify database credentials (DB_USER, DB_PASSWORD, DB_DATABASE)
```

### 3. JiraAPIError (Exit Code: 3)

**When it occurs:**
- Jira API authentication fails (401)
- Jira API rate limits exceeded (429)
- Network connectivity issues
- Invalid project key or JQL query

**Example:**
```
ERROR: JiraAPIError

Message:
  HTTP 401: Unauthorized

Resolution Steps:
  1. Check JIRA_EMAIL in .env file
  2. Verify JIRA_API_TOKEN is valid and not expired
  3. Generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens
  4. Ensure the API token has appropriate permissions
```

### 4. GoogleDriveError (Exit Code: 4)

**When it occurs:**
- Service account credentials are invalid
- Folder ID doesn't exist or is inaccessible
- Permission denied (403)
- Network connectivity issues

**Example:**
```
ERROR: GoogleDriveError

Message:
  Error listing files in folder: Permission denied

Resolution Steps:
  1. Check service account permissions for the Google Drive folder
  2. Share the folder with the service account email (found in service-account-key.json)
  3. Ensure the service account has "Viewer" or higher permissions
  4. Verify the folder ID is correct in config file
```

### 5. FileSystemError (Exit Code: 5)

**When it occurs:**
- Cannot read/write files
- Directory creation fails
- File not found when expected
- Permission denied

**Example:**
```
ERROR: FileSystemError

Message:
  Failed to read private key: ENOENT: no such file or directory

Resolution Steps:
  1. Verify SSH_PRIVATE_KEY_PATH in .env file is correct
  2. Check that the private key file exists
  3. Ensure you have read permissions for the key file
  4. Verify the path is absolute or relative to project root
```

### 6. ValidationError (Exit Code: 6)

**When it occurs:**
- CSV data is malformed
- Required data fields are missing
- Data format is invalid

### 7. NetworkError (Exit Code: 7)

**When it occurs:**
- Network request times out
- Host is unreachable
- DNS resolution fails

## Debug Mode

To see full stack traces and detailed error information:

```bash
# Set DEBUG environment variable
DEBUG=true npm run daily:query

# Or set NODE_ENV to development
NODE_ENV=development npm run jira:export
```

## Error Logging

Errors can be automatically logged to files for later analysis:

```bash
# Enable error logging to files
LOG_ERRORS=true npm run datasource:generate

# Or in production environment (automatic)
NODE_ENV=production npm run all
```

Log files are saved to `logs/error-{timestamp}.log` and include:
- Full error details with stack trace
- Context information (module, operation, config file)
- Environment information (Node version, platform, current directory)
- Timestamp and error type

## Common Error Scenarios

### Scenario 1: Missing Configuration File

**Error:**
```
ConfigurationError: Configuration file not found
```

**Solution:**
1. Create `config.json` from `config.example.jsonc`
2. Or specify a different config: `CONFIG_FILE=config.rocks.json npm run all`

### Scenario 2: Invalid Jira Credentials

**Error:**
```
JiraAPIError: HTTP 401: Unauthorized
```

**Solution:**
1. Check `JIRA_EMAIL` in `.env`
2. Regenerate `JIRA_API_TOKEN` from Atlassian account settings
3. Update `.env` with new token

### Scenario 3: SSH Connection Failed

**Error:**
```
DatabaseConnectionError: SSH connection error: ENOTFOUND
```

**Solution:**
1. Verify `SSH_HOST` is correct in `.env`
2. Check network connectivity to remote host
3. Verify firewall settings allow SSH connections

### Scenario 4: Google Drive Access Denied

**Error:**
```
GoogleDriveError: Error listing files in folder: Permission denied
```

**Solution:**
1. Open `service-account-key.json`
2. Find the `client_email` field
3. Share Google Drive folder with that email address
4. Grant "Viewer" or higher permissions

### Scenario 5: Missing Input Files

**Error:**
```
FileSystemError: Data directory not found
```

**Solution:**
1. Run prerequisite steps first (e.g., `npm run daily:query` before `npm run daily:convert`)
2. Or run the complete workflow: `npm run daily:all`

## Exit Codes for Automation

The system uses specific exit codes to help with automation and CI/CD:

| Exit Code | Error Type | Description |
|-----------|------------|-------------|
| 0 | Success | Operation completed successfully |
| 1 | ConfigurationError | Configuration issues |
| 2 | DatabaseConnectionError | Database/SSH connection failures |
| 3 | JiraAPIError | Jira API issues |
| 4 | GoogleDriveError | Google Drive API issues |
| 5 | FileSystemError | File system operations failed |
| 6 | ValidationError | Data validation failures |
| 7 | NetworkError | Network connectivity issues |

**Example usage in scripts:**

```bash
#!/bin/bash
npm run jira:export
EXIT_CODE=$?

if [ $EXIT_CODE -eq 3 ]; then
  echo "Jira API error - check credentials"
elif [ $EXIT_CODE -eq 7 ]; then
  echo "Network error - retrying in 5 minutes"
  sleep 300
  npm run jira:export
fi
```

## For Developers

### Adding Error Handling to New Scripts

```javascript
// 1. Import error classes and handler
const { JiraAPIError, ConfigurationError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');

// 2. Wrap main function with try/catch
async function main() {
  try {
    // Validate preconditions
    if (!config.jira.project) {
      throw new ConfigurationError('No Jira project specified', {
        field: 'jira.project',
        resolutionSteps: [
          'Add a "project" field under "jira" in your config file',
          'Use the project key (e.g., "AICD", "PROJ")',
          'See config.example.jsonc for reference'
        ]
      });
    }

    // Your code here
    const result = await someOperation();

  } catch (err) {
    handleError(err, {
      module: 'jira',
      operation: 'export-to-csv',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

// 3. Call main function
if (require.main === module) {
  main();
}
```

### Creating Custom Errors

```javascript
const { JiraAPIError } = require('../lib/errors');

// Throw with custom context and resolution steps
throw new JiraAPIError('Rate limit exceeded', {
  statusCode: 429,
  retryAfter: 60,
  resolutionSteps: [
    'Wait 60 seconds before retrying',
    'Reduce the date range in your query',
    'Check for other processes making Jira API calls'
  ]
});
```

### Wrapping Third-Party Errors

```javascript
const { createErrorFromNative } = require('../lib/error-handler');

try {
  const result = await someLibraryCall();
} catch (nativeError) {
  throw createErrorFromNative(nativeError, 'database', {
    query: 'SELECT * FROM ...',
    resolutionSteps: [
      'Check SQL syntax',
      'Verify database permissions'
    ]
  });
}
```

## See Also

- `docs/CONFIG_VALIDATION.md` - Configuration validation system
- `docs/VALIDATION_QUICK_REFERENCE.md` - Quick reference for config validation
- `.github/copilot-instructions.md` - Complete architecture documentation
- `lib/errors.js` - Error class definitions
- `lib/error-handler.js` - Error handling implementation
