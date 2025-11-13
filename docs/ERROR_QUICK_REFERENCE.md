# Error Handling Quick Reference

Quick guide to understanding and resolving errors in the Data Source Orchestrator.

## Exit Codes

| Code | Error Type | Common Cause |
|------|-----------|--------------|
| 1 | ConfigurationError | Missing or invalid config file |
| 2 | DatabaseConnectionError | SSH or database connection failed |
| 3 | JiraAPIError | Jira authentication or API failure |
| 4 | GoogleDriveError | Drive permissions or folder access |
| 5 | FileSystemError | File not found or permission denied |
| 6 | ValidationError | Invalid data format |
| 7 | NetworkError | Network connectivity issue |

## Quick Fixes

### ConfigurationError
```bash
# Create config from example
cp config.example.jsonc config.json

# Or specify different config
CONFIG_FILE=config.rocks.json npm run all
```

### DatabaseConnectionError
```bash
# Check .env file has these set:
SSH_HOST=your-host
SSH_PORT=22
SSH_USERNAME=deploy
SSH_PRIVATE_KEY_PATH=./path/to/key.pem
DB_USER=username
DB_PASSWORD=password
DB_DATABASE=database_name
```

### JiraAPIError
```bash
# Check .env file has these set:
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-token-here

# Generate new token at:
# https://id.atlassian.com/manage-profile/security/api-tokens
```

### GoogleDriveError
1. Open `service-account-key.json`
2. Find the `client_email` value
3. Share Google Drive folder with that email
4. Grant "Viewer" or "Editor" permissions

### FileSystemError
```bash
# Reset all output directories
npm run clean

# Then re-run your workflow
npm run daily:all
```

## Debug Mode

See full error details and stack traces:

```bash
# Linux/Mac
DEBUG=true npm run jira:export

# Windows (PowerShell)
$env:DEBUG="true"; npm run jira:export

# Windows (CMD)
set DEBUG=true && npm run jira:export
```

## Common Error Messages

### "Configuration file not found"
→ Create `config.json` or set `CONFIG_FILE` environment variable

### "SSH connection error: Authentication failed"
→ Check `SSH_PRIVATE_KEY_PATH` and verify key permissions (chmod 600)

### "HTTP 401: Unauthorized"
→ Regenerate Jira API token or check Google service account key

### "Permission denied"
→ Share Google Drive folder with service account email

### "Data directory not found"
→ Run prerequisite steps first (e.g., `npm run daily:query`)

### "Rate limit exceeded"
→ Wait a few minutes, then reduce date range in config

## Error Log Files

When `LOG_ERRORS=true` or `NODE_ENV=production`:
- Errors saved to `logs/error-{timestamp}.log`
- Contains full stack trace and context
- JSON format for easy parsing

## Getting Help

1. Read the error message and resolution steps
2. Check `docs/ERROR_HANDLING.md` for detailed explanations
3. Review `docs/CONFIG_VALIDATION.md` for config issues
4. Run with `DEBUG=true` for more details
5. Check log files in `logs/` directory

## Example Error Output

```
════════════════════════════════════════════════════════════
ERROR: JiraAPIError
════════════════════════════════════════════════════════════

Message:
  HTTP 401: Unauthorized

Module:
  jira

Operation:
  export-to-csv

Resolution Steps:
  1. Check JIRA_EMAIL in .env file
  2. Verify JIRA_API_TOKEN is valid and not expired
  3. Generate a new API token at: https://...
  4. Ensure the API token has appropriate permissions

────────────────────────────────────────────────────────────
```

## Testing Error Handling

Test the error system:

```bash
# See all error types
node test-error-handling.js all

# Test specific error
node test-error-handling.js jira
node test-error-handling.js config

# With debug mode
DEBUG=true node test-error-handling.js database
```

## For Automation/Scripts

Use exit codes to handle errors:

```bash
#!/bin/bash
npm run jira:export
EXIT_CODE=$?

case $EXIT_CODE in
  0) echo "Success!" ;;
  1) echo "Config error - check config.json" ;;
  2) echo "Database error - check SSH tunnel" ;;
  3) echo "Jira error - check API credentials" ;;
  4) echo "Drive error - check folder permissions" ;;
  *) echo "Unknown error - exit code $EXIT_CODE" ;;
esac
```

## See Also

- **docs/ERROR_HANDLING.md** - Complete error handling guide
- **docs/CONFIG_VALIDATION.md** - Configuration validation reference
- **docs/VALIDATION_QUICK_REFERENCE.md** - Config field quick reference
