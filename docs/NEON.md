# Neon PostgreSQL Database Integration

## Overview

The Neon PostgreSQL database integration stores generated data sources with metadata, checksums, and Vercel Blob references for structured querying and analysis.

## Features

✅ **Hidden Behind Feature Flag** - Won't run unless `ENABLE_NEON_DB_STORAGE=true`  
✅ **Production-Ready** - Uses `@neondatabase/serverless` (works anywhere Node.js runs)  
✅ **Automatic Deduplication** - Re-running with same data updates existing records  
✅ **File Integrity** - SHA-256 checksums verify uploaded files  
✅ **Non-Fatal Errors** - Database failures won't break datasource generation  
✅ **Multi-Environment** - Different UUID caches for dev/staging/prod  

## Quick Start

### Step 1: Run Database Setup

1. **Run migrations** (one-time setup):
   - Execute SQL from `migrations/001_initial_schema.sql` in Neon Console
   - Execute SQL from `migrations/002_updated_at_triggers.sql` in Neon Console

2. **Seed the database**:
   ```bash
   node scripts/seed-neon-db.js
   ```
   - Generates SQL for organizations, teams, and report types
   - Execute the generated SQL in Neon Console
   - Manually create UUID cache file (`.neon-db-ids.dev.json`) with returned UUIDs

### Step 2: Configure Environment

Add to your `.env` file:

```bash
# Vercel Blob (required for Neon - stores blob references)
ENABLE_VERCEL_BLOB_UPLOAD=true
BLOB_READ_WRITE_TOKEN=your_vercel_token_here

# Neon Database Storage
ENABLE_NEON_DB_STORAGE=true
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_ENV=dev  # or staging, prod
```

**Important**: Replace placeholders with your actual credentials from Neon Console.

### Step 3: Test It!

Run any datasource generator:

```bash
# Test with any generator
npm run aicoach:weekly
npm run engagepath:weekly
npm run rocks:weekly
```

**What happens:**
1. ✅ Generates datasource.py as normal
2. ✅ Uploads to Vercel Blob (with checksums)
3. ✅ **Automatically stores to Neon database**
4. ✅ Console shows: "Successfully stored X records to Neon database"

## Database Schema

Your database has these tables:

1. **organizations** - Full Scale, Full Scale Ventures
2. **teams** - rocks, timeclock, ai-coach, engagepath
3. **daily_reports** - Daily report entries (one per employee per day)
   - Deduplication: `(project_id, author_name, report_date)` unique
   - Contains markdown content inline + optional blob reference
4. **meeting_transcripts** - Transcript files (one per meeting)
   - Deduplication: `(project_id, filename, transcript_date)` unique
   - Contains full transcript text inline + blob reference
5. **jira_snapshots** - Weekly Jira data (blob references only)
   - No deduplication (time-based snapshots)
6. **slack_captures** - Weekly Slack data (blob references only)
   - No deduplication
7. **report_types** - 1on1, dashboard, weekly-digest
8. **generated_reports** - Future use
9. **report_data_links** - Future use

## What Gets Stored

### Daily Reports
- Split by date (one row per employee per day)
- Markdown content stored inline
- Blob references from Vercel upload
- SHA-256 checksums

### Meeting Transcripts
- One row per transcript file
- Full transcript text stored inline
- Blob references from Vercel upload
- Date parsed from filename

### Jira Snapshots
- One row per week (blob reference only)
- Week start/end dates from config
- Points to epic_tree markdown in Vercel Blob

### Slack Captures
- One row per channel per week (blob reference only)
- Week start/end dates from config
- Points to sanitized Slack markdown in Vercel Blob

## Console Output Example

When Neon storage is enabled:

```
=== Storing Data to Neon Database ===

Project: ai-coach
Environment: dev
Project UUID: 2b7e52de-37e6-4d6d-b72f-15a8bf855bc5

Processing daily reports...
  ✓ daily-reports-John-Doe-2025-10-27-to-2025-11-02.md: 5 daily sections
  ✓ daily-reports-Jane-Smith-2025-10-27-to-2025-11-02.md: 5 daily sections

Processing transcripts...
  ✓ fathom-transcripts-2025-10-27T14:30:00.md
  ✓ fathom-transcripts-2025-10-28T10:15:00.md

Processing Jira snapshot...
  ✓ jira_data_weekly_2025-10-27_to_2025-11-02.md

Processing Slack captures...
  ✓ 2 Slack files

=== Neon Database Storage Summary ===
Daily Reports: 10 inserted from 2 files
Transcripts: 2 inserted from 2 files
Jira Snapshots: 1 inserted from 1 files
Slack Captures: 2 inserted from 2 files

✓ Successfully stored 15 records to Neon database
```

## Verifying Data

Query your database using Neon Console SQL Editor:

```sql
-- Check daily reports
SELECT report_date, author_name, LEFT(content, 50) as preview 
FROM daily_reports 
ORDER BY report_date DESC 
LIMIT 10;

-- Check transcripts
SELECT transcript_date, filename, byte_size 
FROM meeting_transcripts 
ORDER BY transcript_date DESC 
LIMIT 10;

-- Check Jira snapshots
SELECT collected_week_start, collected_week_end, blob_key 
FROM jira_snapshots 
ORDER BY collected_week_start DESC;

-- Check Slack captures
SELECT collected_week_start, collected_week_end, blob_key 
FROM slack_captures 
ORDER BY collected_week_start DESC;
```

## Multi-Environment Support

The implementation supports multiple Neon instances:

1. Set different `NEON_ENV` values (dev, staging, prod)
2. Each environment uses its own UUID cache: `.neon-db-ids.{NEON_ENV}.json`
3. Migrations are portable (pure SQL)
4. Seed script is idempotent

Example for production:

```bash
# Production environment
NEON_ENV=prod node scripts/seed-neon-db.js

# Creates .neon-db-ids.prod.json
# Run generators with NEON_ENV=prod
```

## Troubleshooting

### Storage is Disabled

**Symptom**: Console shows "Storage disabled"

**Solution**: 
- Check: `ENABLE_NEON_DB_STORAGE=true` in `.env`
- Check: `ENABLE_VERCEL_BLOB_UPLOAD=true` in `.env` (required!)

### Database Connection Errors

**Symptom**: Console shows "DATABASE_URL not configured" or connection failures

**Solution**:
- Check: `DATABASE_URL=postgresql://...` in `.env`
- Verify connection string format includes `?sslmode=require`
- Test connection using Neon Console

### Could Not Find Project UUID

**Symptom**: Console shows "Could not find project UUID for {projectFolder}"

**Solution**:
- Check: `.neon-db-ids.{NEON_ENV}.json` exists
- Verify team name matches projectFolder (e.g., "ai-coach" not "aicoach")
- Re-run seed script if UUIDs are missing

### Insert Failures

**Symptom**: Console shows failed insertions

**Solution**:
- Enable debug mode: `DEBUG=true npm run aicoach:weekly`
- Check Neon Console → Monitoring for connection issues
- Verify UUID cache file contains correct UUIDs
- Verify migrations were executed successfully

## Implementation Details

### Automatic SQL Execution

The implementation uses `@neondatabase/serverless` package to automatically execute SQL statements. This means:
- No manual SQL execution required
- Works in any Node.js environment (local, Vercel, AWS Lambda, etc.)
- No dependency on Cursor or MCP services

### Data Flow

1. Generate datasource.py (normal workflow)
2. Upload to Vercel Blob (if enabled) - computes checksums
3. Store in Neon DB (if enabled and DATABASE_URL configured):
   - Parse markdown outputs to extract metadata
   - Split daily reports by date sections
   - Extract author names, dates, filenames
   - Match blob references from Vercel upload results
   - Execute SQL INSERT statements with ON CONFLICT handling
   - Report success/failure counts to console

### Deduplication

- Daily reports use `(project_id, author_name, report_date)` as natural key
- Transcripts use `(project_id, filename, transcript_date)` as natural key
- ON CONFLICT clauses automatically update existing records
- Jira and Slack snapshots allow duplicates (time-based data)

### Checksum Usage

- SHA-256 checksums computed during Vercel upload
- Stored for file integrity verification
- NOT used for deduplication (natural keys used instead)
- Useful for verifying uploaded blob content matches source files

## Local Files

**Important**: Local markdown files are always preserved. Neon stores metadata and references, not replacements.

## Support

For issues or questions:
1. Check console output for detailed error messages
2. Review this documentation
3. Check `.github/copilot-instructions.md` for architectural details
4. Verify environment variables are set correctly
5. Enable debug mode for detailed logging

