# Data Source Orchestrator

A collection of tools for aggregating and processing data from multiple sources including database reports, Jira tickets, and meeting transcripts.

## Project Structure

```
data-source-orchestrator/
├── .env                          # Environment variables (create from example.env)
├── example.env                   # Example environment variables file
├── config.json                   # Main configuration file (create from config.example.jsonc)
├── config.example.jsonc          # Example configuration with comments
├── config.project1.example.json  # Example config for project1
├── config.project2.example.json  # Example config for project2
├── config.project1.json          # Actual config for project1 (create from example)
├── config.project2.json          # Actual config for project2 (create from example)
├── service-account-key.json      # Google service account credentials (you provide this)
├── daily-reports/                # Database report extraction and processing
├── jira/                         # Jira ticket export and analysis
├── transcripts/                  # Google Drive transcript download and conversion
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
   - **Jira Integration**: See [jira/README.md](jira/README.md)
   - **Transcript Processing**: See [transcripts/SETUP_GOOGLE_DRIVE.md](transcripts/SETUP_GOOGLE_DRIVE.md)

## Configuration Overview

The `config.json` file contains three main sections:

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

**Pre-configured project scripts:**
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

**Custom config file (recommended - cross-platform):**
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

## Support

For detailed setup and usage instructions, refer to the README files in each module's directory.
