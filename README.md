# Data Source Orchestrator

A collection of tools for aggregating and processing data from multiple sources including database reports, Jira tickets, and meeting transcripts.

## Project Structure

```
data-source-orchestrator/
├── .env                          # Environment variables (create from example.env)
├── example.env                   # Example environment variables file
├── config.json                   # Legacy single-file config (backward compatible)
├── config.example.jsonc          # Example configuration with comments
├── config.project1.example.json  # Example config for project1
├── config.project2.example.json  # Example config for project2
├── config.project1.json          # Actual config for project1 (create from example)
├── config.project2.json          # Actual config for project2 (create from example)
├── service-account-key.json      # Google service account credentials (you provide this)
├── daily-reports/                # Database report extraction and processing
├── jira/                         # Jira ticket export and analysis
├── transcripts/                  # Google Drive transcript download and conversion
├── configs/                      # NEW: Hierarchical configuration directory
│   ├── shared/                   # Shared defaults applied to all teams
│   │   └── defaults.json
│   ├── rocks/                    # Team: ROCKS
│   │   ├── config.json           # Base team config (required)
│   │   ├── config.1on1.json      # Report override (optional)
│   │   ├── config.team.json      # Report override (optional)
│   │   └── config.weekly.json    # Report override (optional)
│   └── engagepath/               # Team: EngagePath
│       ├── config.json           # Base team config (required)
│       ├── config.1on1.json      # Report override (optional)
│       ├── config.team.json      # Report override (optional)
│       └── config.weekly.json    # Report override (optional)
└── package.json                  # Node.js dependencies
```

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure the Application**
   
   **For a single project:**
   ```bash
   # Copy the example files
   cp example.env .env
   cp config.example.jsonc config.json
   
   # Edit .env with your credentials (Jira, SSH, Database)
   # Edit config.json with your project settings (remove all comments)
   ```
   
   **For multiple projects:**
   ```bash
   # Copy the example files
   cp example.env .env
   cp config.project1.example.json config.project1.json
   cp config.project2.example.json config.project2.json
   
   # Edit .env with your credentials
   # Edit each config.projectX.json with project-specific settings
   ```

3. **Set Up Each Module**
   - **Daily Reports**: See [daily-reports/README.md](daily-reports/README.md)
     - Optional one-off override: when a specific employee’s reports live under a different `client_project_id`, add `employeeProjectOverrides` to your config under `dailyReports.query`.
       Example:
       ```json
       {
         "dailyReports": {
           "query": {
             "client_project_id": 531,
             "employee_id": "",
             "report_date_start": "2025-09-22",
             "report_date_end": "2025-10-05",
             "employeeProjectOverrides": [
               { "employee_id": 22375, "client_project_ids": 540 }
             ]
           }
         }
       }
       ```
       This includes rows from the base project (531) and, for employee 22375, also from project 540.
   - **Jira Integration**: See [jira/README.md](jira/README.md)
     - Changelog sections are included by default in per-assignee and team reports. Entries are concise one-liners, e.g.:
       - `- 2025-08-15 00:14 • Ismael Jr. Cristal • status: Backlog → In Progress`
       - `- 2025-08-27 16:15 • Crystal Selina Bandalan • Sprint: +Proposed Sprint 6 -MVP Sprint 5`
       - `- 2025-08-07 21:00 • cleo • description: [updated; 1,234 chars]`
     - Weekly digest prefers `epic_tree_with_changelog_*.md` when available.
   - **Transcript Processing**: See [transcripts/SETUP_GOOGLE_DRIVE.md](transcripts/SETUP_GOOGLE_DRIVE.md)

## Configuration Structure

Use hierarchical configs under `configs/`:

- Merge order: `configs/shared/defaults.json` → `configs/{team}/config.json` → `configs/{team}/config.{reportType}.json`
- Load via `lib/config.js` using either:
  - Legacy: `const config = require('../lib/config').load();` (single file via CONFIG_FILE)
  - Report types: `const config = require('../lib/config').ConfigManager.loadForReportType(team, reportType);`

Report types:
- `1on1`: Per-member generation (uses full team from base unless override narrows to one)
- `team`: Team-level datasource, typically ignores `dailyReports`
- `weekly`: Weekly digest; includes per-assignee Jira, all daily reports, transcripts

The merged configuration contains these sections:

### dailyReports
- Query parameters for filtering employee reports
- SSH and database credentials are now in .env file

### jira
- Project key for Jira export
- Date range for ticket filtering
- Team member list for filtering assignees

### transcripts
- Google Drive folder ID for transcript storage
- Service account credentials path
- Download and conversion settings
- Optional date filtering for transcripts

## Security Notes

- **Never commit `.env` or `config.json`** to version control
- **Never commit `service-account-key.json`** - keep it secure
- The `.gitignore` file includes these files to prevent accidental commits
- Store SSH private keys securely
- All sensitive credentials are now in the `.env` file
- The `config.json` only contains non-sensitive configuration

## Multi-Project Support

### Using Different Configurations

The system supports multiple project configurations. You can run commands for different projects using:

**Pre-configured project scripts (deprecated, still supported):**
```bash
# Run all tasks for project1
npm run project1:all

# Run specific tasks for project1
npm run project1:daily
npm run project1:jira
npm run project1:transcripts

# Run tasks for project2
npm run project2:all
npm run project2:daily
```

**Custom config file (legacy - cross-platform):**
```bash
# Using the 'use' helper command
npm run use config.myproject.json daily:all
npm run use config.client-xyz.json jira:export
npm run use config.custom.json all

# Or using cross-env directly
npx cross-env CONFIG_FILE=config.myproject.json npm run daily:all
npx cross-env CONFIG_FILE=config.client-xyz.json npm run jira:all
```

**Platform-specific commands:**
```bash
# On Unix/Mac
CONFIG_FILE=config.myproject.json npm run all

# On Windows (Command Prompt)
set CONFIG_FILE=config.myproject.json && npm run all

# On Windows (PowerShell)
$env:CONFIG_FILE="config.myproject.json"; npm run all
```

### Report-Type Commands (NEW)

Use these commands to run per-team with report types:

```bash
# ROCKS
npm run rocks:1on1     # Individual datasources (one file per member)
npm run rocks:team     # Team datasource (consolidated)
npm run rocks:weekly   # Weekly digest (daily + Jira per-assignee + transcripts)

# EngagePath
npm run engagepath:1on1
npm run engagepath:team
npm run engagepath:weekly
```

Generic (no team specified; legacy single-file config):
```bash
npm run generate:1on1
npm run generate:team
npm run generate:weekly
```

Config file locations:

| Team       | Report Type | Base Config                           | Report Override                                   |
|------------|-------------|----------------------------------------|---------------------------------------------------|
| rocks      | 1on1        | `configs/rocks/config.json`            | `configs/rocks/config.1on1.json` (optional)       |
| rocks      | team        | `configs/rocks/config.json`            | `configs/rocks/config.team.json` (optional)       |
| rocks      | weekly      | `configs/rocks/config.json`            | `configs/rocks/config.weekly.json` (optional)     |
| engagepath | 1on1        | `configs/engagepath/config.json`       | `configs/engagepath/config.1on1.json` (optional)  |
| engagepath | team        | `configs/engagepath/config.json`       | `configs/engagepath/config.team.json` (optional)  |
| engagepath | weekly      | `configs/engagepath/config.json`       | `configs/engagepath/config.weekly.json` (optional)|

### Adding New Projects

1. Create a new config file:
   ```bash
   cp config.project1.example.json config.newproject.json
   ```

2. Add npm scripts to package.json:
   ```json
   "newproject:daily": "cross-env CONFIG_FILE=config.newproject.json npm run daily:all",
   "newproject:jira": "cross-env CONFIG_FILE=config.newproject.json npm run jira:all",
   "newproject:all": "cross-env CONFIG_FILE=config.newproject.json npm run all"
   ```

3. Edit `config.newproject.json` with project-specific settings

## Common Date Ranges

Each module can use different date ranges. To synchronize them:

```json
{
  "dailyReports": {
    "query": {
      "report_date_start": "2025-01-01",
      "report_date_end": "2025-01-31"
    }
  },
  "jira": {
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  },
  "transcripts": {
    "dateFilter": {
      "startDate": "2025-01-01",
      "endDate": "2025-01-31",
      "enabled": true
    }
  }
}
```

### outputFilenames (optional)

Control the generated datasource filenames per report type using tokenized templates.

Supported tokens:
- `{project}`, `{projectFolder}`, `{team}`, `{reportType}`, `{start_date}`, `{end_date}`
- 1on1-specific: `{memberShort}`, `{memberFull}`, `{memberSlug}`
- Utility: `{today}` (YYYY-MM-DD), `{timestamp}` (YYYYMMDD_HHmmss)

Defaults (if omitted):
- weekly: `datasource_weekly_{project}.py`
- team: `datasource_{project}_team.py`
- oneOnOne: `datasource_{memberShort}.py`

Example:
```json
{
  "outputFilenames": {
    "weekly": "digest_{projectFolder}_{start_date}_to_{end_date}.py",
    "team": "team_{project}_{start_date}_to_{end_date}.py",
    "oneOnOne": "{memberSlug}_{project}_{start_date}.py"
  }
}
```

Notes:
- Templates are sanitized and `.py` is ensured.
- 1on1 filenames are generated per member using team-name mapping for `{memberShort}`; `{memberSlug}` is a safe slug of the full name.

## Cleaning Generated Data

Clean specific data types:
```bash
npm run daily:clean       # Clean daily reports CSV and markdown files
npm run jira:clean        # Clean JIRA CSV and markdown files
npm run transcripts:clean # Clean downloaded transcripts and markdown files
npm run datasource:clean  # Clean generated datasource Python files
```

Clean all generated data at once:
```bash
npm run clean:all
```

This will remove all generated files while preserving the directory structure and configuration files.

## Project-Scoped Outputs (Breaking Change)

Outputs are written under per-project folders to avoid cross-project mixing:

- Daily reports → `daily-reports/data/{projectFolder}/`, `daily-reports/md-output/{projectFolder}/`
- Jira → `jira/data/{projectFolder}/`, `jira/data/{projectFolder}/by-assignee/`, `jira/md_output/{projectFolder}/`
- Transcripts → `transcripts/downloads/{projectFolder}/`, `transcripts/markdown-output/{projectFolder}/`
- Datasources → `datasource-generator/output/{projectFolder}/`

`{projectFolder}` comes from `datasource-generator/team-name-mapping-<team>.json` (projectFolder), then `team-name-mapping.json`, then `config.jira.project.toLowerCase()`, then `<team>`.

## Run All Teams Sequentially (Rate-limit Friendly)

```bash
npm run all:weekly   # all teams weekly digest
npm run all:1on1     # all teams 1on1

# Optional overrides
cross-env RUN_TEAMS="rocks,engagepath" INTER_PROJECT_DELAY_MS=10000 npm run all:weekly
```

Per-team commands remain available (e.g., `rocks:weekly`, `engagepath:1on1`).

## Support

For detailed setup and usage instructions, refer to the README files in each module's directory.
