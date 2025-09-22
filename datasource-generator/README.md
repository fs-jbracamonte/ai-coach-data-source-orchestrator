# Datasource Generator

This module generates Python datasource files for each team member by combining data from multiple sources:
- Daily reports
- JIRA tickets
- Meeting transcripts (Fathom)
- CLAAP (if available)

## Configuration

### Team Name Mapping

Edit `team-name-mapping.json` to configure short names for team members:

```json
{
  "mappings": {
    "Full Name": "shortname",
    "John Doe": "john"
  }
}
```

If no mapping is provided, the full name will be used (converted to lowercase with underscores).

## Usage

### Generate All Data and Datasources

This command will:
1. Query and generate daily reports for all team members
2. Export and split JIRA tickets by assignee
3. Download and convert transcripts
4. Combine all data into Python datasource files

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

The generated files will be placed in `datasource-generator/output/`:
- `datasource_jam.py` - For Jamnilloh Bracamonte
- `datasource_mark.py` - For Mark Jerly Bundalian
- etc.

Each file contains:
- `DAILY_TEXT` - Daily reports specific to the team member
- `JIRA_TEXT` - JIRA tickets assigned to the team member
- `FATHOM_TEXT` - All meeting transcripts (shared across team members)
- `CLAAP_TEXT` - CLAAP data (if available)
- `PROJECT_CONTEXT_AND_HEALTH` - Static project context information

## File Structure

```
datasource-generator/
├── generate_datasources.js      # Main generation script
├── generate_from_existing.js    # Generate from existing markdown
├── team-name-mapping.json       # Name to short name mappings
├── README.md                    # This file
├── output/                      # Generated Python files
│   ├── datasource_jam.py
│   ├── datasource_mark.py
│   └── ...
└── templates/
    └── datasource_template.py   # Python file template
```
