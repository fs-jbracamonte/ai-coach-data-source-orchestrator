# Data Source Orchestrator

A collection of tools for aggregating and processing data from multiple sources including database reports, Jira tickets, and meeting transcripts.

## Project Structure

```
data-source-orchestrator/
├── .env                     # Environment variables (create from example.env)
├── example.env              # Example environment variables file
├── config.json              # Main configuration file (create from config.example.jsonc)
├── config.example.jsonc     # Example configuration with comments (JSON with Comments format)
├── service-account-key.json # Google service account credentials (you provide this)
├── daily-reports/           # Database report extraction and processing
├── jira/                    # Jira ticket export and analysis
├── transcripts/             # Google Drive transcript download and conversion
└── package.json             # Node.js dependencies
```

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure the Application**
   ```bash
   # Copy the example files
   cp example.env .env
   cp config.example.jsonc config.json
   
   # Edit .env with your credentials (Jira, SSH, Database)
   # Edit config.json with your project settings (remove all comments)
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
