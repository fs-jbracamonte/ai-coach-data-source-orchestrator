# Data Source Orchestrator

A collection of tools for aggregating and processing data from multiple sources including database reports, Jira tickets, meeting transcripts, and Slack conversations. Generates Python datasource files for AI model consumption.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Copy and edit environment variables
   cp example.env .env
   # Edit .env with your API keys, database credentials, etc.
   ```

3. **Set Up Team Configurations**
   - Use hierarchical configs in `configs/{team}/` directory
   - See `docs/CONFIG_VALIDATION.md` for configuration details
   - See `docs/MIGRATION_GUIDE.md` if migrating from legacy single-file configs

4. **Run a Generator**
   ```bash
   # Generate weekly digest for a team
   npm run rocks:weekly
   
   # Or generate 1-on-1 reports
   npm run engagepath:1on1
   ```

For detailed module setup:
- **Daily Reports**: See [daily-reports/README.md](daily-reports/README.md)
- **Jira Integration**: See [jira/README.md](jira/README.md)
- **Transcripts**: See [transcripts/SETUP_GOOGLE_DRIVE.md](transcripts/SETUP_GOOGLE_DRIVE.md)
- **Slack**: See [slack/README.md](slack/README.md)

## Available Commands

### Team-Specific Commands

```bash
# ROCKS
npm run rocks:1on1     # Individual datasources
npm run rocks:team     # Team datasource
npm run rocks:weekly   # Weekly digest

# EngagePath
npm run engagepath:1on1
npm run engagepath:team
npm run engagepath:weekly
npm run engagepath:dashboard  # Includes Slack data

# AI Coach
npm run aicoach:1on1
npm run aicoach:team
npm run aicoach:weekly
npm run aicoach:dashboard

# Timeclock
npm run timeclock:1on1
npm run timeclock:team
npm run timeclock:weekly
```

### Run All Teams Sequentially

```bash
npm run all:weekly   # All teams weekly digest
npm run all:1on1     # All teams 1on1
```

### Cleaning Generated Data

```bash
npm run clean                           # Clean all modules, all projects
npm run clean -- --team rocks           # Clean specific team
npm run clean -- --modules jira,transcripts  # Clean specific modules
```

See `docs/CLEANING.md` for detailed cleaning options.

## Optional Integrations

### Vercel Blob Storage

Automatically upload generated markdown outputs to Vercel Blob for backup and distribution.

```bash
# Add to .env
ENABLE_VERCEL_BLOB_UPLOAD=true
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx
```

See `docs/VERCEL_BLOB_INTEGRATION.md` for setup details.

### Neon PostgreSQL Database

Store generated data sources in Neon PostgreSQL with metadata and blob references.

```bash
# Add to .env
ENABLE_VERCEL_BLOB_UPLOAD=true  # Required!
ENABLE_NEON_DB_STORAGE=true
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_ENV=dev
```

See `docs/NEON.md` for complete setup and usage instructions.

## Troubleshooting

For common errors and configuration issues, see:
- `docs/ERROR_HANDLING.md` - Complete error guide with resolutions
- `docs/ERROR_QUICK_REFERENCE.md` - Quick error reference
- `docs/CONFIG_VALIDATION.md` - Configuration validation guide
- `docs/VALIDATION_QUICK_REFERENCE.md` - Required fields reference

## Documentation

- **Configuration**: `docs/CONFIG_VALIDATION.md`, `docs/VALIDATION_QUICK_REFERENCE.md`
- **Error Handling**: `docs/ERROR_HANDLING.md`, `docs/ERROR_QUICK_REFERENCE.md`
- **Cleaning**: `docs/CLEANING.md`
- **Integrations**: `docs/VERCEL_BLOB_INTEGRATION.md`, `docs/NEON.md`
- **Migration**: `docs/MIGRATION_GUIDE.md`
- **Module READMEs**: See individual module directories for detailed setup

## Security

- Never commit `.env`, `config.json`, or `service-account-key.json`
- Store SSH private keys securely
- All sensitive credentials go in `.env` file
- Configuration files contain only non-sensitive settings
