# Configuration Validation - Quick Reference

## ✅ What Gets Validated

### Automatic Validation on Every Config Load
- **Type checking**: Strings, numbers, booleans, arrays
- **Required fields**: Missing fields cause immediate errors
- **Date formats**: Must be YYYY-MM-DD
- **Date ranges**: Start dates must be ≤ end dates
- **Domain formats**: Jira host must be domain only (no protocol)
- **Folder IDs**: Google Drive folder ID format validation

## 📋 Required vs Optional Fields

### At Least One Section Required
Your config must have at least one of: `dailyReports`, `jira`, or `transcripts`

### Daily Reports (Optional Section)
If included, **all fields required**:
```json
{
  "dailyReports": {
    "query": {
      "client_project_id": 32,          // Required: positive integer
      "employee_id": "",                // Required: see formats below
      "report_date_start": "2025-01-01",// Required: YYYY-MM-DD
      "report_date_end": "2025-01-31"   // Required: YYYY-MM-DD
    }
  }
}
```

### Jira (Optional Section)
```json
{
  "jira": {
    "host": "company.atlassian.net",  // Optional: domain only
    "project": "ROCKS",               // Required: project key
    "start_date": "2025-01-01",       // Required: YYYY-MM-DD
    "end_date": "2025-01-31",         // Required: YYYY-MM-DD
    "team_members": []                // Optional: defaults to []
  }
}
```

### Transcripts (Optional Section)
```json
{
  "transcripts": {
    "folder_ids": ["folder-id"],              // Required*
    "serviceAccountKeyFile": "./key.json",    // Required
    "downloadDir": "./downloads",             // Required
    "filePrefix": "",                         // Optional
    "sanitizeFilenames": true,                // Optional (default: true)
    "organizeByFolder": false,                // Optional (default: false)
    "convertToMarkdown": true,                // Optional (default: false)
    "markdownOutputDir": "./markdown-output", // Required if convertToMarkdown=true
    "dateFilter": {                           // Optional
      "startDate": "2025-01-01",
      "endDate": "2025-01-31",
      "enabled": true
    }
  }
}
```
*Either `folder_ids` (array) or `folderId` (string/array) required

## 🔧 Employee ID Formats

All of these are valid:
```json
// All employees
"employee_id": ""

// Single employee
"employee_id": 123
"employee_id": "123"

// Multiple employees
"employee_id": [123, 456, 789]
"employee_id": "123,456,789"
```

**Invalid**:
```json
"employee_id": []  // Empty array - use "" instead
```

## ⚠️ Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `Date must be in YYYY-MM-DD format` | Use `"2025-01-31"` not `"01/31/2025"` |
| `start_date must be before or equal to end_date` | Check date order |
| `Do not include protocol (http://)` | Use `"company.atlassian.net"` not `"https://company.atlassian.net"` |
| `employee_id array must contain at least one ID` | Use `""` for all employees or `[123]` for specific |
| `Configuration must contain at least one section` | Add `dailyReports`, `jira`, or `transcripts` |

## 🧪 Testing Validation

Test your config file:
```bash
# Default config.json
node -e "require('./lib/config').load(); console.log('✓ Valid');"

# Specific config file
CONFIG_FILE=config.rocks.json node -e "require('./lib/config').load(); console.log('✓ Valid');"

# Or use cross-env for Windows compatibility
npx cross-env CONFIG_FILE=config.rocks.json node -e "require('./lib/config').load();"
```

## 📚 Full Documentation

- `docs/CONFIG_VALIDATION.md` - Complete validation guide with examples
- `config.example.jsonc` - Annotated configuration example
- `schemas/config.schema.js` - Full Joi schema definition
- `lib/validators.js` - Runtime validation functions
