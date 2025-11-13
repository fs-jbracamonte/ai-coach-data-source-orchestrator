# Migration Guide: Single-File Configs → Hierarchical Report Types

This guide helps you migrate from legacy single-file configs to the new hierarchical configuration structure with report types.

## What Changed and Why

- New `configs/` directory with shared defaults, team base configs, and minimal report-specific overrides
- Clear report types: `1on1`, `team`, `weekly`
- Deep merge on load: shared → base → report override (arrays replaced)
- Benefits: reuse common settings, safer overrides, simpler per-report changes

## Before vs After

Before:
```
config.rocks.json
config.engagepath.json
```

After:
```
configs/
├── shared/defaults.json
├── rocks/
│   ├── config.json
│   ├── config.1on1.json
│   ├── config.team.json
│   └── config.weekly.json
└── engagepath/
    ├── config.json
    ├── config.1on1.json
    ├── config.team.json
    └── config.weekly.json
```

## Step-by-Step Migration

1. Create team directories and copy base configs
```
mkdir -p configs/rocks configs/engagepath configs/shared
cp config.rocks.json configs/rocks/config.json
cp config.engagepath.json configs/engagepath/config.json
```

2. Create shared defaults (optional)
```
echo "{\n  \"transcripts\": {\n    \"enableContentPreFilter\": false,\n    \"preFilterRetries\": 3,\n    \"preFilterTimeout\": 5000,\n    \"convertToMarkdown\": true,\n    \"sanitizeFilenames\": true\n  }\n}" > configs/shared/defaults.json
```

3. Create minimal report overrides (only differences)
```
# 1on1
echo "{\n  \"reportType\": \"1on1\",\n  \"jira\": { \"team_members\": [\"John Doe\"] },\n  \"dailyReports\": { \"query\": { \"employee_id\": 123 } }\n}" > configs/rocks/config.1on1.json

# team
echo "{\n  \"reportType\": \"team\",\n  \"jira\": { \"team_members\": [] }\n}" > configs/rocks/config.team.json

# weekly
echo "{\n  \"reportType\": \"weekly\",\n  \"jira\": { \"team_members\": [\"A\",\"B\"] },\n  \"dailyReports\": { \"query\": { \"employee_id\": [1,2] } }\n}" > configs/rocks/config.weekly.json
```

4. Use new commands
```
npm run rocks:1on1
npm run rocks:team
npm run rocks:weekly
```

5. Keep old root configs for compatibility (do not delete yet)

## FAQ

Q: How are configs merged?
A: `shared/defaults.json` → `team/config.json` → `team/config.{reportType}.json`. Objects merge deeply; arrays are replaced.

Q: Do I have to set `reportType`?
A: Optional. Scripts enforce the report type; the field is validated when present.

Q: How do I still use a single file config?
A: Use `CONFIG_FILE` with generic commands, e.g. `CONFIG_FILE=configs/rocks/config.json npm run generate:weekly`.

Q: Why did `engagepath:1on1` only generate one file?
A: The 1on1 override can narrow to a single member. Use base config with `generate:1on1` to generate all members, or use the updated script which loads the base config for EngagePath.

## Validation

See `docs/CONFIG_VALIDATION.md` for report-type validation rules and common errors.

