# Jira CSV Export

Simple script to export Jira issues to CSV using your JQL query.

## Setup

1. Install dotenv:
   ```
   npm install dotenv
   ```
   
   Note: The @atlassian/jira package is not required - the script uses direct HTTPS requests.

2. Edit `.env` file in the main project folder with your Jira credentials:
   ```
   JIRA_HOST=your-domain.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your-api-token
   ```
   
   **Important:** 
   - JIRA_HOST should be your Jira instance domain WITHOUT https://
   - It must be a Jira domain, not Bitbucket or other Atlassian services
   - Example: `mycompany.atlassian.net`

3. Edit `config.json` in the main folder to set your project, date range, and team members under the `jira` section:
   ```json
   {
     "project": "AICD",
     "start_date": "2025-08-01",
     "end_date": "2025-08-31",
     "team_members": [
       "Jamnilloh Bracamonte",
       "Mark Jerly Bundalian",
       "Ashley Ken Comandao"
     ]
   }
   ```
   
   **Configuration Options:**
   - `project`: **(Required)** The Jira project key (e.g., "AICD", "PROJ", etc.)
   - `start_date` & `end_date`: **(Required)** Date range for the export
   - `team_members`: **(Optional)** Array of assignee names to filter by
     - If empty or not specified, exports ALL assignees
     - If specified, only exports tickets for listed team members

## Usage

### Run All Steps at Once
```bash
npm run jira:all
```

This runs the complete pipeline: export → split → convert to markdown

### Run Individual Steps

#### Export All Issues
```bash
npm run jira:export
# Or directly: node jira/export-to-csv.js
```

This will run the query:
```
project = {project} AND updated >= "{start_date}" AND updated <= "{end_date}" ORDER BY updated DESC
```

Where `{project}`, `{start_date}`, and `{end_date}` are taken from your config.json.

The export will include ALL fields and save to `data/{project}_{start_date}_to_{end_date}_export.csv`

#### Split by Team Members
```bash
npm run jira:split
# Or directly: node jira/split-by-assignee.js
```

This will:
- Read the exported CSV file
- Filter issues for team members specified in `config.json`
- Create separate CSV files for each team member in `data/by-assignee/`
- Skip any assignees not in the team_members list (or export all if empty)

#### Convert to Markdown
```bash
npm run jira:markdown
# Or directly: node jira/csv-to-markdown.js
```

This will:
- Read all CSV files from `data/by-assignee/`
- Convert each CSV to a formatted markdown report
- Save markdown files to `md_output/`
- Parse complex JSON fields from the Jira export
- Group tickets by status with proper formatting

## Complete Workflow

Option 1: Run all at once
```bash
npm run jira:all
```

Option 2: Run step by step
```bash
# Step 1: Export all Jira issues
npm run jira:export

# Step 2: Split by team members  
npm run jira:split

# Step 3: Convert to markdown reports
npm run jira:markdown
```

The final markdown reports will be in the `md_output/` folder, with one file per team member containing all their tickets organized by status.

## Examples

### Export all assignees for a project:
```json
{
  "project": "AICD",
  "start_date": "2025-08-01",
  "end_date": "2025-08-31",
  "team_members": []
}
```

### Export specific team members for another project:
```json
{
  "project": "PROJ",
  "start_date": "2025-09-01",
  "end_date": "2025-09-30",
  "team_members": [
    "John Doe",
    "Jane Smith"
  ]
}
```

See `config-all-assignees.json.example` and `config-other-project.json.example` for more examples.

## Required Packages
- dotenv (for environment variables)
- csv-parser (for reading CSV files)
- csv-writer (for writing CSV files)
