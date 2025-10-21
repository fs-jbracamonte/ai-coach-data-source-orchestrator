# Datasource Generator

This module generates Python datasource files for each team member by combining data from multiple sources:
- Daily reports
- JIRA tickets
- Meeting transcripts (Fathom)

## Configuration

### Team Name Mapping and Project Folder

Edit `team-name-mapping.json` to configure:
1. Project folder name for organizing output files
2. Short names for team members

```json
{
  "projectFolder": "ai-coach",
  "mappings": {
    "Full Name": "shortname",
    "John Doe": "john"
  }
}
```

- `projectFolder`: The subdirectory name under `output/` where datasource files will be placed (defaults to "default" if not specified)
- `mappings`: If no mapping is provided for a team member, their full name will be used (converted to lowercase with underscores)

## Usage

### Generate Individual Team Member Datasources (reportType: 1on1)

This command will:
1. Query and generate daily reports for the employee IDs configured in config.json
2. Export and split JIRA tickets by assignee
3. Download and convert transcripts
4. Combine all data into Python datasource files (one per team member)

**Note**: Daily reports will be queried based on the `employee_id` array in your config.json. Make sure the employee IDs match the team members you want to generate datasources for.

```bash
# Preferred (report types)
node datasource-generator/generate_datasources.js --team rocks --report 1on1
node datasource-generator/generate_datasources.js --team engagepath --report 1on1

# NPM scripts
npm run rocks:1on1
npm run engagepath:1on1

# Legacy (single-file config)
CONFIG_FILE=configs/rocks/config.json npm run datasource:generate
```

### Generate Team-Level Datasource (reportType: team)

This command generates a single datasource file for the entire team:
1. Runs `jira:team-all` to generate a consolidated team report
2. Downloads all transcripts from configured folders
3. Combines everything into a single `datasource_<project>_team.py` file

```bash
# Preferred
node datasource-generator/generate_team_datasource.js --team rocks --report team
npm run rocks:team

# Legacy
npm run datasource:team
```

For project-specific team datasources:
```bash
npm run rocks:datasource-team
```

### Generate Weekly Digest Datasource (reportType: weekly)

This command generates a comprehensive weekly digest that includes daily reports:
1. Runs `daily:all` to generate daily reports for configured employee IDs
2. Runs `jira:all` to generate individual JIRA reports for configured team members (excludes unassigned tickets)
3. Downloads all transcripts from configured folders
4. Combines all three data sources into a single `datasource_weekly_<project>.py` file

```bash
# Preferred
node datasource-generator/generate_weekly_digest.js --team rocks --report weekly
npm run rocks:weekly

# Legacy
npm run datasource:weekly-digest
```

For project-specific weekly digests:
```bash
npm run rocks:datasource-weekly
```

### Generate from Existing Data

If you already have the markdown files generated, you can create datasource files without re-running all queries:

```bash
npm run datasource:from-existing
```

### Configuration

You can use different config files:

Configs are hierarchical under `configs/`. Merge order:
`configs/shared/defaults.json` → `configs/{team}/config.json` → `configs/{team}/config.{reportType}.json`

- Preferred loader: `loadForReportType(team, reportType)` via CLI flags shown above
- Legacy loader: `CONFIG_FILE` environment variable

Troubleshooting:
- Ensure `configs/{team}/config.json` exists
- For weekly: verify `jira/md_output/by-assignee/` contains assignee markdown
- For 1on1: if only one file is produced, check if `configs/{team}/config.1on1.json` narrows `jira.team_members` to one name

## Output

### Individual Datasources

Generated files will be placed in `datasource-generator/output/<projectFolder>/`:
- `output/ai-coach/datasource_jam.py` - For Jamnilloh Bracamonte
- `output/ai-coach/datasource_mark.py` - For Mark Jerly Bundalian
- etc.

The project folder is configured in `team-name-mapping.json`.

Each individual file contains:
- `DAILY_TEXT` - Daily reports specific to the team member
- `JIRA_TEXT` - JIRA tickets assigned to the team member
- `FATHOM_TEXT` - All meeting transcripts (shared across team members)

### Team Datasource

The team datasource file will be placed in `datasource-generator/output/`:
- `output/datasource_rocks_team.py` - For ROCKS project
- `output/datasource_aicd_team.py` - For AI Coach project
- etc.

Each team file contains:
- `JIRA_DATA` - Complete team report with all tickets and statistics
- `TRANSCRIPT_DATA` - All meeting transcripts from configured folders
- Helper functions for searching and analyzing the data

### Weekly Digest Datasource

The weekly digest file will be placed in `datasource-generator/output/`:
- `output/datasource_weekly_rocks.py` - For ROCKS project
- `output/datasource_weekly_aicd.py` - For AI Coach project
- etc.

Each weekly digest file contains:
- `JIRA_DATA` - Individual JIRA reports for configured team members only (unassigned tickets excluded)
- `DAILY_REPORTS_DATA` - Concatenated daily reports for all configured employees
- `TRANSCRIPT_DATA` - All meeting transcripts from configured folders
  - Slack (dashboard/weekly when enabled) is read only from `slack/md-output/{projectFolder}/sanitized/*.md`
- Helper functions for searching content and extracting summaries
- Additional helper functions specific to daily reports and JIRA analysis

## File Structure

```
datasource-generator/
├── generate_datasources.js       # Main generation script for individual datasources
├── generate_from_existing.js     # Generate from existing markdown
├── generate_team_datasource.js   # Generate team-level datasource
├── generate_weekly_digest.js     # Generate weekly digest with daily reports
├── team-name-mapping.json        # Project folder and name mappings
├── README.md                     # This file
├── output/                       # Generated Python files
│   ├── datasource_rocks_team.py     # Team-level datasource
│   ├── datasource_weekly_rocks.py   # Weekly digest datasource
│   ├── datasource_aicd_team.py      # Team-level datasource
│   ├── datasource_weekly_aicd.py    # Weekly digest datasource
│   └── ai-coach/                    # Project folder (configured in team-name-mapping.json)
│       ├── datasource_jam.py        # Individual datasource
│       ├── datasource_mark.py       # Individual datasource
│       └── ...
└── templates/
    ├── datasource_template.py       # Individual datasource template
    └── team_datasource_template.py  # Team datasource template
```
