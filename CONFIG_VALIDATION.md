# Configuration Validation

This project uses comprehensive configuration validation to catch errors early, before running any data collection or processing scripts.

## Validation System

The validation system consists of three components:

### 1. Joi Schema (`schemas/config.schema.js`)
Defines the complete structure and type requirements for configuration files:
- **Required vs Optional fields**: Clearly specified in the schema
- **Type validation**: Ensures strings, numbers, booleans, and arrays are correct types
- **Custom error messages**: Provides helpful examples in error messages
- **Date format validation**: Ensures YYYY-MM-DD format
- **Date range validation**: Ensures start dates are before end dates

### 2. Runtime Validators (`lib/validators.js`)
Additional validation functions for specific formats:
- `validateDateFormat()` - YYYY-MM-DD format checking
- `validateDateRange()` - Ensures start_date <= end_date
- `validateEmployeeId()` - Handles multiple formats: `""`, `"123"`, `123`, `[123, 456]`, `"123,456"`
- `validateJiraHost()` - Validates domain format, warns about protocol inclusion
- `validateFolderId()` - Google Drive folder ID format validation
- `validateFolderIds()` - Validates array of folder IDs

### 3. Config Manager (`lib/config.js`)
Automatically validates on load (single-file and merged hierarchical configs):
- Validates configuration structure with Joi schema
- Runs additional runtime validators
- Throws descriptive errors with field names and examples
- Caches validated config for performance

## Required vs Optional Fields
### Report Type (Optional)
- `reportType` must be one of: `1on1`, `team`, `weekly` when present

Report-type guidance:
- `1on1`:
  - `jira.team_members` may contain a single member
  - `dailyReports.query.employee_id` may be a single ID
- `team`:
  - `dailyReports` section may be omitted
  - `jira.team_members` may be empty (`[]`) to include unassigned tickets
- `weekly`:
  - `jira.team_members` should be non-empty
  - `dailyReports.query.employee_id` should cover the full team


### Daily Reports Section (Optional)
If included, all fields are **required**:
- `dailyReports.query.client_project_id` - Integer, positive number
- `dailyReports.query.employee_id` - String/Number/Array (see Employee ID Formats below)
- `dailyReports.query.report_date_start` - String in YYYY-MM-DD format
- `dailyReports.query.report_date_end` - String in YYYY-MM-DD format

### Jira Section (Optional)
If included, required fields are:
- `jira.project` - String, project key (uppercase)
- `jira.start_date` - String in YYYY-MM-DD format
- `jira.end_date` - String in YYYY-MM-DD format

Optional fields:
- `jira.host` - String, Jira domain (e.g., "yourcompany.atlassian.net")
- `jira.team_members` - Array of strings (defaults to `[]` for all team members)

### Transcripts Section (Optional)
If included, required fields are:
- `transcripts.serviceAccountKeyFile` - String, path to service account JSON
- `transcripts.downloadDir` - String, download directory path
- **Either** `transcripts.folder_ids` (array) **or** `transcripts.folderId` (string/array)

Optional fields:
- `transcripts.filePrefix` - String (defaults to `""`)
- `transcripts.sanitizeFilenames` - Boolean (defaults to `true`)
- `transcripts.organizeByFolder` - Boolean (defaults to `false`)
- `transcripts.dateFilter` - Object with `startDate`, `endDate`, and `enabled` fields
- `transcripts.convertToMarkdown` - Boolean (defaults to `false`)
- `transcripts.markdownOutputDir` - String (required if `convertToMarkdown` is `true`)

## Employee ID Formats

The `employee_id` field supports multiple formats for flexibility:

```json
// All employees
"employee_id": ""

// Single employee (as number)
"employee_id": 123

// Single employee (as string)
"employee_id": "123"

// Multiple employees (as array)
"employee_id": [123, 456, 789]

// Multiple employees (as CSV string)
"employee_id": "123,456,789"
```

## Common Validation Errors
### 6. Invalid Report Type
```
Error: Invalid reportType: 'monthly'. Allowed values are 1on1, team, weekly.
```

**Fix**: Use a valid report type or remove the field:
```json
// ✓ Correct
"reportType": "weekly"
```

### 7. Weekly Missing Team Members
```
Error: weekly report requires jira.team_members to be non-empty
```

**Fix**: Provide the full team list in base or weekly override:
```json
"jira": { "team_members": ["Alice", "Bob"] }
```

### 8. Team Report With Daily Reports
```
Warning: team reportType ignores dailyReports section
```

**Resolution**: Remove `dailyReports` from the team override, keep it in base if needed elsewhere.

### 1. Invalid Date Format
```
Error: Date must be in YYYY-MM-DD format (e.g., "2025-01-31")
```

**Fix**: Use YYYY-MM-DD format instead of MM/DD/YYYY or DD-MM-YYYY:
```json
// ❌ Wrong
"start_date": "01/01/2025"

// ✓ Correct
"start_date": "2025-01-01"
```

### 2. Invalid Date Range
```
Error: start_date (2025-12-31) must be before or equal to end_date (2025-01-01)
```

**Fix**: Ensure start date is before or equal to end date:
```json
// ❌ Wrong
"start_date": "2025-12-31",
"end_date": "2025-01-01"

// ✓ Correct
"start_date": "2025-01-01",
"end_date": "2025-12-31"
```

### 3. Invalid Jira Host
```
Error: Do not include protocol (http:// or https://)
```

**Fix**: Use domain only, without protocol:
```json
// ❌ Wrong
"host": "https://yourcompany.atlassian.net"

// ✓ Correct
"host": "yourcompany.atlassian.net"
```

### 4. Empty Employee ID Array
```
Error: employee_id array must contain at least one ID (use "" for all employees)
```

**Fix**: Use empty string for all employees, or provide at least one ID:
```json
// ❌ Wrong
"employee_id": []

// ✓ Correct (all employees)
"employee_id": ""

// ✓ Correct (specific employees)
"employee_id": [123, 456]
```

### 5. Missing Required Field
```
Error: jira.project is required (your Jira project key)
  Example: "project": "ROCKS"
```

**Fix**: Add the required field to your configuration:
```json
// ❌ Wrong
{
  "jira": {
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  }
}

// ✓ Correct
{
  "jira": {
    "project": "ROCKS",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  }
}
```

## Testing Validation

Run the validation test suite:
```bash
node test-validation.js
```

This tests:
1. Valid configuration files (config.json, config.rocks.json)
2. Invalid date ranges
3. Invalid date formats
4. Missing required fields
5. Empty team_members array (should work)
6. Invalid employee_id formats
7. Invalid Jira host formats

## Benefits

1. **Early Error Detection**: Catches configuration errors before running expensive operations
2. **Clear Error Messages**: Provides specific guidance on how to fix errors
3. **Type Safety**: Ensures all fields have correct types
4. **Format Validation**: Validates dates, domains, and IDs
5. **Helpful Examples**: Error messages include correct format examples
6. **Flexibility**: Supports multiple valid formats (e.g., employee_id)

## See Also

- `config.example.jsonc` - Complete configuration example with comments
- `schemas/config.schema.js` - Full Joi validation schema
- `lib/validators.js` - Runtime validation functions
- `lib/config.js` - Configuration loading and validation
