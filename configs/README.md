## Configs Directory

This directory organizes project configurations into a hierarchical structure for clarity and reuse.

### Structure

```
configs/
├── rocks/
│   └── config.json
├── engagepath/
│   └── config.json
├── shared/
│   └── defaults.json
└── README.md
```

### Concept

- Base team configs live in `configs/<team>/config.json`.
- Common, reusable settings live in `configs/shared/defaults.json`.
- Report-specific overrides (if needed in the future) should be separate files in the team directory (e.g., `configs/rocks/jira.weekly.json`) that are merged on top of the base.

### Merge Order

1. shared defaults → 2. team base → 3. report-specific overrides

Later entries override earlier ones. Consumers should always load configuration via the shared loader `lib/config.js`.

### When to Use What

- Use `shared/defaults.json` for:
  - Common transcript settings across teams
  - Cross-project date format examples and guidance
  - Flags that are typically consistent for all projects

- Use `<team>/config.json` for:
  - Project-specific Jira `host`, `project`, and team members
  - Daily reports `client_project_id` and employee IDs
  - Folder IDs and mapping files unique to the team

- Use report-specific overrides when:
  - You need different date ranges or thresholds for a single run/report
  - You’re testing alternative settings without changing the team base config

### Notes

- Do not delete legacy root-level config files yet; they remain for backward compatibility while tools are updated to read from `configs/`.
- Always load configs via `const config = require('../lib/config').load();` which performs validation and error handling.

### Report Types

- `1on1`: Per-member datasources. Keep most fields in base; override only the member and employee_id when needed.
- `team`: Team datasource (consolidated). Usually omit `dailyReports` in the override; may set `jira.team_members` to `[]` to include unassigned.
- `weekly`: Weekly digest. Override to ensure full team `jira.team_members` and full team `dailyReports.query.employee_id`.

### Example Overrides

`configs/engagepath/config.1on1.json` (minimal):
```json
{
  "reportType": "1on1",
  "jira": { "team_members": ["John Michael Losito"] },
  "dailyReports": { "query": { "employee_id": 8368 } }
}
```

`configs/engagepath/config.team.json` (minimal):
```json
{
  "reportType": "team",
  "jira": { "team_members": [] }
}
```

`configs/engagepath/config.weekly.json` (minimal):
```json
{
  "reportType": "weekly",
  "jira": { "team_members": ["John Michael Losito", "Ismael Jr. Cristal", "Harvey Aparece", "Gerald de los Santos", "Santos Ngo Jr"] },
  "dailyReports": { "query": { "employee_id": [8368, 477, 11469, 21749, 22205] } }
}
```

### Which config file should I edit?

- Need to add/remove a team member or change project key? → Edit `configs/<team>/config.json` (base)
- Running a single-person 1:1? → Edit `configs/<team>/config.1on1.json`
- Generating consolidated team datasource? → Edit `configs/<team>/config.team.json`
- Producing weekly digest? → Edit `configs/<team>/config.weekly.json`
- Shared transcript behavior across all teams? → Edit `configs/shared/defaults.json`

### Migration from Single-File Configs

1. Move your `config.<team>.json` to `configs/<team>/config.json`.
2. Create minimal overrides in `configs/<team>/config.{reportType}.json` (only differences).
3. Update npm scripts to use report-type commands (see root `README.md`).
4. Keep old root-level configs for backward compatibility.

