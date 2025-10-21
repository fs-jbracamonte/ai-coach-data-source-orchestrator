# Cleaning System Documentation

## Overview

The Data Source Orchestrator uses a centralized cleaning system to remove generated and downloaded data across all modules. The cleaner automatically discovers projects from mapping files and existing outputs, making it maintenance-free when new projects are added.

## Quick Start

```bash
# Clean everything (all modules, all projects)
npm run clean

# Clean a specific team
npm run clean -- --team rocks

# Clean a specific project folder
npm run clean -- --projectFolder engagepath

# Clean specific modules only
npm run clean -- --modules jira,transcripts

# Remove Slack users.json files (normally preserved)
npm run clean -- --purge-slack-users
```

## Command Line Options

### `--team <name>`
Resolve the project folder for a specific team and clean only that project.

**How it works:**
- Uses `lib/project-folder.getProjectFolder(team)` to resolve the projectFolder
- Resolution priority:
  1. `datasource-generator/team-name-mapping-{team}.json` → `projectFolder`
  2. `datasource-generator/team-name-mapping.json` (via mapping-resolver) → `projectFolder`
  3. `config.jira.project` (lowercase)
  4. Team name as-is
  5. `'default'`

**Examples:**
```bash
npm run clean -- --team rocks
npm run clean -- --team engagepath
npm run clean -- --team aicoach
npm run clean -- --team timeclock
```

**Note:** This option does NOT load config files, avoiding validation requirements. It uses mapping files and safe fallbacks.

### `--projectFolder <name>`
Clean a specific project folder by its exact name.

**Examples:**
```bash
npm run clean -- --projectFolder rocks
npm run clean -- --projectFolder engagepath
npm run clean -- --projectFolder ai-coach
```

### `--modules <csv>`
Limit cleaning to specific modules. Comma-separated list of: `jira`, `transcripts`, `slack`, `daily`, `datasource`.

**Examples:**
```bash
# Clean only Jira data
npm run clean -- --modules jira

# Clean Jira and transcripts
npm run clean -- --modules jira,transcripts

# Clean everything except datasource outputs
npm run clean -- --modules jira,transcripts,slack,daily
```

### `--purge-slack-users`
Remove Slack `users.json` mapping files (normally preserved by default).

**Example:**
```bash
npm run clean -- --purge-slack-users

# Combine with other options
npm run clean -- --team rocks --purge-slack-users
```

## Default Behavior

When run without arguments, the cleaner:
1. Auto-discovers all project folders (see "Project Discovery" below)
2. Cleans all modules for all discovered projects
3. Preserves Slack `users.json` files

## Project Discovery

The cleaner automatically discovers project folders without requiring any hardcoded configuration. This means **new projects are automatically included** when you add mapping files or generate outputs.

### Discovery Sources

1. **Mapping files** in `datasource-generator/`:
   - Reads all `team-name-mapping*.json` files
   - Extracts `projectFolder` values

2. **Existing output directories**:
   - Scans subdirectories under:
     - `datasource-generator/output/*`
     - `jira/data/*`
     - `jira/md_output/*`
     - `daily-reports/data/*`
     - `daily-reports/md-output/*`
     - `transcripts/downloads/*`
     - `transcripts/markdown-output/*`
     - `slack/data/*`
     - `slack/md-output/*`

3. **Union of both sources**:
   - All unique project folder names are collected
   - Sorted alphabetically

### Adding New Projects

**No code changes required!** When you:
- Add a new team mapping file: `datasource-generator/team-name-mapping-newteam.json`
- Generate outputs for a new project

The cleaner will automatically discover and include the new project in its operations.

## Module Cleaning Behavior

### Daily Reports (`daily`)
**Removes:**
- `daily-reports/data/{projectFolder}/` (CSV files)
- `daily-reports/md-output/{projectFolder}/` (markdown files)

### Jira (`jira`)
**Removes:**
- `jira/data/{projectFolder}/` (CSV exports, by-assignee data)
- `jira/md_output/{projectFolder}/` (markdown reports, team reports, epic trees)
- `jira/data/changelogs/` (global changelog cache)
- `jira/data/by-assignee/changelogs/` (global changelog cache)

**Note:** Jira changelog caches are always removed when the jira module is selected, regardless of project scope.

### Transcripts (`transcripts`)
**Removes:**
- `transcripts/downloads/{projectFolder}/` (raw .txt files)
- `transcripts/markdown-output/{projectFolder}/` (converted markdown files)

### Slack (`slack`)
**Removes:**
- `slack/data/{projectFolder}/` (downloaded JSON files)
- `slack/md-output/{projectFolder}/` (converted markdown, including sanitized outputs)

**Preserves:**
- `slack/data/{projectFolder}/users.json` (user mapping files)
- Unless `--purge-slack-users` flag is used

### Datasource Generator (`datasource`)
**Removes:**
- `datasource-generator/output/{projectFolder}/` (all generated .py files)

## Advanced Usage Examples

### Clean everything for a specific team
```bash
npm run clean -- --team rocks
```

### Clean Jira and transcripts for engagepath
```bash
npm run clean -- --projectFolder engagepath --modules jira,transcripts
```

### Clean all Slack data including user maps
```bash
npm run clean -- --modules slack --purge-slack-users
```

### Clean all datasource outputs across all projects
```bash
npm run clean -- --modules datasource
```

### Clean multiple specific projects
```bash
# Run multiple commands
npm run clean -- --projectFolder rocks
npm run clean -- --projectFolder engagepath
npm run clean -- --projectFolder ai-coach
```

## Integration with Workflows

### Before Fresh Data Collection
Always clean outputs before running a complete data collection workflow:

```bash
# Clean everything first
npm run clean

# Then run your workflow
npm run rocks:weekly
npm run engagepath:weekly
```

### Team-Specific Workflows
```bash
# Clean and regenerate for a specific team
npm run clean -- --team rocks
npm run rocks:weekly
```

### Module-Specific Cleaning
When testing specific integrations:

```bash
# Clean and retest Jira integration
npm run clean -- --modules jira
npm run jira:export
npm run jira:team-all

# Clean and retest transcripts
npm run clean -- --modules transcripts
npm run transcripts:download
```

## Implementation Details

### Cross-Platform Compatibility
- Uses Node.js `fs.rmSync()` with `{ recursive: true, force: true }`
- Works on Windows, macOS, and Linux
- Handles missing directories gracefully (no errors)

### Error Handling
- Non-fatal errors are logged but don't stop execution
- Missing directories are silently skipped
- Permission errors are reported but don't crash the cleaner

### Performance
- Fast directory removal using Node.js built-in methods
- Minimal filesystem operations
- Auto-discovery runs once at startup

## Troubleshooting

### "No project folders to clean"
**Cause:** No mapping files found and no existing output directories.

**Solution:** Either:
- Add a team mapping file in `datasource-generator/`
- Generate some outputs first (e.g., `npm run rocks:weekly`)

### "Error resolving team 'xyz'"
**Cause:** Team resolution failed in `lib/project-folder.js`.

**Solution:** 
- Verify team name spelling
- Check that mapping file exists: `datasource-generator/team-name-mapping-{team}.json`
- Use `--projectFolder` instead if you know the exact folder name

### Slack users.json keeps getting deleted
**Cause:** Using `--purge-slack-users` flag.

**Solution:** Remove the flag. By default, `users.json` is always preserved.

### Some files remain after cleaning
**Possible causes:**
1. Files are locked by another process (Windows)
2. Permission issues
3. Files are in unexpected locations

**Solution:**
- Close any programs accessing the files
- Run with elevated permissions if needed
- Check that files are actually in project-scoped subdirectories

## Related Documentation

- [Configuration System](../CONFIG_VALIDATION.md) - How projects are configured
- [AI Agent Instructions](../.github/copilot-instructions.md) - Architecture overview
- [README](../README.md) - Main documentation



