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

### Generate All Data and Datasources

This command will:
1. Query and generate daily reports for the employee IDs configured in config.json
2. Export and split JIRA tickets by assignee
3. Download and convert transcripts
4. Combine all data into Python datasource files

**Note**: Daily reports will be queried based on the `employee_id` array in your config.json. Make sure the employee IDs match the team members you want to generate datasources for.

```bash
npm run datasource:generate
```

### Generate from Existing Data

If you already have the markdown files generated, you can create datasource files without re-running all queries:

```bash
npm run datasource:from-existing
```

### Using Different Configurations

You can use different config files:

```bash
# Using a custom config
CONFIG_FILE=config.project1.json npm run datasource:generate

# Or using the run-with-config utility
npm run use config.project1.json datasource:generate
```

## Output

The generated files will be placed in `datasource-generator/output/<projectFolder>/`:
- `output/ai-coach/datasource_jam.py` - For Jamnilloh Bracamonte
- `output/ai-coach/datasource_mark.py` - For Mark Jerly Bundalian
- etc.

The project folder is configured in `team-name-mapping.json`.

Each file contains:
- `DAILY_TEXT` - Daily reports specific to the team member
- `JIRA_TEXT` - JIRA tickets assigned to the team member
- `FATHOM_TEXT` - All meeting transcripts (shared across team members)

## File Structure

```
datasource-generator/
├── generate_datasources.js      # Main generation script
├── generate_from_existing.js    # Generate from existing markdown
├── team-name-mapping.json       # Project folder and name mappings
├── README.md                    # This file
├── output/                      # Generated Python files organized by project
│   └── ai-coach/                # Project folder (configured in team-name-mapping.json)
│       ├── datasource_jam.py
│       ├── datasource_mark.py
│       └── ...
└── templates/
    └── datasource_template.py   # Python file template
```
