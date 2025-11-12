# Vercel Blob Storage Integration

## Overview

This integration automatically uploads all generated markdown outputs and extracted Jira data to Vercel Blob Storage at the end of each datasource generation workflow. This provides backup, distribution, and remote access capabilities for all generated data.

## Features

- ✅ **Feature Flag Control**: Easily enable/disable via environment variable
- ✅ **Non-Fatal Errors**: Upload failures log warnings but don't stop workflows
- ✅ **Date-Based Versioning**: Filenames include date ranges to prevent overwrites
- ✅ **Structured Storage**: Mirrors local directory structure in Blob storage
- ✅ **Jira Data Extraction**: Automatically extracts JIRA_DATA from datasource.py files
- ✅ **All Report Types Supported**: Weekly, team, 1on1, and dashboard reports

## Setup Instructions

### 1. Create a Vercel Blob Store

1. Go to your Vercel project dashboard
2. Navigate to the **Storage** tab
3. Click **Create Database** and select **Blob Store**
4. Vercel will automatically generate the `BLOB_READ_WRITE_TOKEN` environment variable

### 2. Configure Local Environment

Add the following to your local `.env` file:

```bash
# Vercel Blob Storage
ENABLE_VERCEL_BLOB_UPLOAD=true
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxxxxxxx
```

**Important**: 
- Set `ENABLE_VERCEL_BLOB_UPLOAD=false` to disable uploads (default behavior)
- Copy the `BLOB_READ_WRITE_TOKEN` from your Vercel dashboard

### 3. Install Dependencies

The `@vercel/blob` package is already installed (version 2.0.0). If you need to reinstall:

```bash
npm install @vercel/blob
```

## What Gets Uploaded

The integration uploads the following data after each datasource generation:

### 1. Transcripts
- **Source**: `transcripts/markdown-output/{projectFolder}/`
- **Destination**: `{projectFolder}/transcripts/`
- **Files**: All `.md` files with date ranges in filenames

### 2. Daily Reports
- **Source**: `daily-reports/md-output/{projectFolder}/`
- **Destination**: `{projectFolder}/daily-reports/`
- **Files**: All `.md` files with date ranges in filenames

### 3. Slack Data (Sanitized)
- **Source**: `slack/md-output/{projectFolder}/sanitized/`
- **Destination**: `{projectFolder}/slack/sanitized/`
- **Files**: All sanitized `.md` files with date ranges in filenames

### 4. Jira Data (Extracted)
- **Source**: Extracted from generated `datasource.py` files
- **Destination**: `{projectFolder}/jira/`
- **Files**: `jira_data_{reportType}_{start_date}_to_{end_date}.md`

## Blob Storage Structure

Files are organized in Vercel Blob Storage as follows:

```
{projectFolder}/
├── transcripts/
│   ├── fathom-transcripts-2025-10-27_to_2025-11-02.md
│   └── meeting-notes-2025-10-27_to_2025-11-02.md
├── daily-reports/
│   ├── john_doe_2025-10-27_to_2025-11-02.md
│   └── jane_smith_2025-10-27_to_2025-11-02.md
├── slack/
│   └── sanitized/
│       └── ai-coach-dev_2025-10-27_to_2025-11-02.md
└── jira/
    ├── jira_data_weekly_2025-10-27_to_2025-11-02.md
    ├── jira_data_team_2025-10-27_to_2025-11-02.md
    └── jira_data_1on1_john_doe_2025-10-27_to_2025-11-02.md
```

## Usage

### Running with Upload Enabled

Once configured, simply run any datasource generator as usual:

```bash
# Weekly digest
npm run rocks:weekly

# Team datasource
npm run engagepath:team

# 1on1 datasources
npm run aicoach:1on1

# Dashboard
npm run aicoach:dashboard
```

The upload process will happen automatically at the end of the workflow.

### Console Output

When uploads are enabled, you'll see output like this:

```
=== Upload to Vercel Blob (if enabled) ===

=== Extracting Jira Data from Datasource ===
Source: datasource-generator/output/aicoach/datasource_weekly_aicoach.py
  ✓ Extracted Jira data saved to: jira/md_output/aicoach/jira_data_weekly_2025-10-27_to_2025-11-02.md
  Size: 45231 characters

=== Uploading to Vercel Blob Storage ===

Uploading transcripts...
  Found 3 markdown files in transcripts/markdown-output/aicoach
  Uploading: meeting1.md → aicoach/transcripts/meeting1_2025-10-27_to_2025-11-02.md
    ✓ Uploaded: https://xxxxx.public.blob.vercel-storage.com/aicoach/transcripts/meeting1_2025-10-27_to_2025-11-02.md
  ✓ Transcripts: 3 uploaded, 0 failed

Uploading daily reports...
  Found 5 markdown files in daily-reports/md-output/aicoach
  ✓ Daily reports: 5 uploaded, 0 failed

Uploading Slack data (sanitized)...
  Found 2 markdown files in slack/md-output/aicoach/sanitized
  ✓ Slack: 2 uploaded, 0 failed

Uploading extracted Jira data...
  ✓ Jira data: 1 uploaded, 0 failed

=== Vercel Blob Upload Summary ===
Total uploaded: 11
Total failed: 0
```

### Disabling Uploads

To disable uploads (default behavior):

```bash
# In .env file
ENABLE_VERCEL_BLOB_UPLOAD=false
```

Or simply don't set the variable at all.

## Implementation Details

### Core Modules

#### 1. `lib/vercel-blob-uploader.js`
- Main upload orchestration
- Feature flag checking
- Directory traversal and file discovery
- Date-range-based filename generation
- Non-fatal error handling

**Key Functions**:
- `uploadAllData(options)` - Main upload function called by generators
- `uploadDirectory(directory, projectFolder, module, config)` - Upload all files from a directory
- `uploadJiraData(filePath, projectFolder, config)` - Upload single Jira data file
- `isUploadEnabled()` - Check if feature flag is set
- `buildBlobPathname(projectFolder, module, filename, dateRange)` - Build destination path

#### 2. `lib/jira-data-extractor.js`
- Extracts JIRA_DATA from datasource.py files
- Supports all report types (weekly, team, 1on1, dashboard)
- Handles escaped triple quotes
- Creates separate markdown files for upload

**Key Functions**:
- `extractAndSave(datasourcePath, outputDir, config, reportType, memberName)` - Extract from single file
- `extractFromDirectory(datasourceDir, outputDir, config, reportType)` - Extract from all files in directory
- `extractJiraData(filePath)` - Parse and extract JIRA_DATA content

### Generator Integration

All four datasource generators have been updated:

1. **`generate_weekly_digest.js`**
   - Uploads: transcripts, daily reports, Slack (sanitized), Jira data
   - Extracts Jira from single weekly datasource.py file

2. **`generate_team_datasource.js`**
   - Uploads: transcripts, Jira data
   - Typically doesn't include daily reports or Slack

3. **`generate_datasources.js`** (1on1)
   - Uploads: transcripts, daily reports, multiple Jira data files
   - Extracts Jira from each member's datasource.py file

4. **`generate_dashboard.js`**
   - Uploads: transcripts, daily reports, Slack (sanitized), Jira data
   - Most comprehensive upload including all data sources

Each generator calls `uploadToVercelBlob()` method at the end of its workflow.

## Troubleshooting

### Upload is Disabled

**Symptom**: Console shows "Upload disabled (ENABLE_VERCEL_BLOB_UPLOAD not set to true)"

**Solution**: Set `ENABLE_VERCEL_BLOB_UPLOAD=true` in your `.env` file

### Token Not Found

**Symptom**: Console shows "Upload enabled but BLOB_READ_WRITE_TOKEN not found"

**Solution**: 
1. Copy the token from your Vercel project dashboard (Storage tab)
2. Add it to your `.env` file: `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx`

### Upload Failures

**Symptom**: Console shows "⚠ Failed to upload..." warnings

**Causes**:
- Network connectivity issues
- Invalid token
- File read errors
- Vercel API rate limits

**Impact**: Non-fatal - workflow continues without uploads

**Solution**: 
1. Check network connection
2. Verify token is correct and not expired
3. Check file permissions
4. Try again after a few minutes (if rate limited)

### Missing Extracted Jira Files

**Symptom**: Console shows "⚠ No JIRA_DATA found in datasource.py"

**Causes**:
- Datasource.py file doesn't contain JIRA_DATA section
- File format is incorrect
- File hasn't been generated yet

**Solution**: 
- Ensure datasource.py files are generated successfully before upload
- Check that JIRA_DATA section exists in the Python files

## File Versioning

Files uploaded to Vercel Blob include date ranges in their filenames to prevent overwrites:

```
{filename}_{start_date}_to_{end_date}.md
```

This means:
- Each time period gets its own unique set of files
- Historical data is preserved
- No risk of accidentally overwriting previous reports

**Example**:
- Week 1: `jira_data_weekly_2025-10-27_to_2025-11-02.md`
- Week 2: `jira_data_weekly_2025-11-03_to_2025-11-09.md`
- Week 3: `jira_data_weekly_2025-11-10_to_2025-11-16.md`

## Local Files

**Important**: Local markdown files are always preserved. Vercel Blob Storage serves as a backup and distribution mechanism, not a replacement for local storage.

- All markdown files remain in their respective local directories
- Datasource.py files are not uploaded (only extracted Jira data)
- You can continue to use local files for development and testing

## Security

- The `BLOB_READ_WRITE_TOKEN` is sensitive and should never be committed to version control
- It's already excluded via `.env` in `.gitignore`
- All uploaded files are public (accessible via URL) - do not upload sensitive data
- The sanitized Slack data pipeline already removes code blocks and secrets

## Support

For issues or questions:
1. Check console output for detailed error messages
2. Review this documentation
3. Check `.github/copilot-instructions.md` for architectural details
4. Verify environment variables are set correctly
5. Test with a single small file first

## Future Enhancements

Potential improvements (not currently implemented):
- Private blob storage option
- Selective upload by file type
- Blob URL export to a manifest file
- Automatic cleanup of old versions
- Upload progress indicators for large files
- Retry logic with exponential backoff

