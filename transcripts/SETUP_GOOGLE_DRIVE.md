# Google Drive Download Script Setup

This script downloads files from a Google Drive folder using Service Account authentication.

## Setup Instructions

### 1. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"

### 2. Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - Name: `drive-downloader` (or any name you prefer)
   - Click "Create and Continue"
4. Skip the optional steps and click "Done"

### 3. Generate Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create New Key"
4. Choose "JSON" format
5. Click "Create" - this will download a JSON key file
6. **Save this file as `service-account-key.json` in the main project folder (not in transcripts)**

### 4. Share Your Google Drive Folder(s)

1. Copy the service account email from the JSON file (look for the `client_email` field)
2. For each Google Drive folder you want to access:
   - Go to the folder in Google Drive
   - Right-click the folder and select "Share"
   - Add the service account email address
   - Give it "Viewer" permission
   - Click "Send"
3. Note down the folder IDs from the URL (the long string after `/folders/` in the URL)

## Configuration

Edit `config.json` to customize the download behavior:

### Multiple Folders (Recommended)

```json
{
  "transcripts": {
    "folder_ids": [
      "1WgzH_coNUo2OVYbjRNnBL1qJ3UG8LtIH",  // Main transcripts folder
      "1ABC123DEF456GHI789JKL012MNO345PQR",  // Team A folder
      "2XYZ789UVW456RST123OPQ789LMN456IJK"   // Team B folder
    ],
    "serviceAccountKeyFile": "./service-account-key.json",
    "downloadDir": "./transcripts/downloads",
    "filePrefix": "",  // Set to download only files starting with this prefix
    "sanitizeFilenames": true,  // Clean special characters from filenames
    "organizeByFolder": true,  // Create subdirectories for each folder
    "dateFilter": {
      "startDate": "",   // Format: "YYYY-MM-DD" (e.g., "2025-08-15")
      "endDate": "",     // Format: "YYYY-MM-DD" (e.g., "2025-09-30")
      "enabled": false   // Set to true to enable date filtering
    },
    "convertToMarkdown": false,  // Set to true to convert .txt transcripts to .md format
    "markdownOutputDir": "./transcripts/markdown-output"
  }
}
```

### Single Folder (Backward Compatible)

```json
{
  "transcripts": {
    "folderId": "1WgzH_coNUo2OVYbjRNnBL1qJ3UG8LtIH",  // Single folder ID
    "serviceAccountKeyFile": "./service-account-key.json",
    "downloadDir": "./transcripts/downloads",
    "filePrefix": "",
    "sanitizeFilenames": true,
    "dateFilter": {
      "startDate": "",
      "endDate": "",
      "enabled": false
    },
    "convertToMarkdown": false,
    "markdownOutputDir": "./transcripts/markdown-output"
  }
}
```

### Configuration Options

- **folder_ids** (array) or **folderId** (string): Google Drive folder ID(s) to download from
- **organizeByFolder** (boolean): When true and using multiple folders, creates subdirectories for each folder
- **filePrefix**: Only download files starting with this prefix (empty string downloads all)
- **dateFilter**: Controls which files are downloaded AND which are included in generated datasources
  - When `enabled: true`, the filter applies twice:
    1. During download: Files outside the date range are not downloaded
    2. During datasource generation: Downloaded files outside the range are excluded from datasource.py files
  - This ensures datasources contain only in-range transcript content
- **sanitizeFilenames**: Clean special characters for cross-platform compatibility
- **dateFilter**: Filter files by modification date range
- **convertToMarkdown**: Automatically convert .txt transcripts to formatted .md files

## Usage

Once setup is complete, run the script:

```bash
cd transcripts
node download-from-drive.js
```

### Download Files with Specific Prefix

To download only files with a specific prefix, update the `filePrefix` in `config.json`:

```json
{
  "filePrefix": "AI_Coach_"  // Only downloads files starting with "AI_Coach_"
}
```

### Download Files by Date Range

To download files modified within a specific date range:

```json
{
  "dateFilter": {
    "startDate": "2025-08-01",  // Files modified from August 1, 2025
    "endDate": "2025-09-30",    // Up to and including September 30, 2025
    "enabled": true             // Must be true to activate date filtering
  }
}
```

You can also use partial date ranges:
- Only `startDate`: Downloads files modified on or after that date
- Only `endDate`: Downloads files modified on or before that date

### Combine Filters

You can use both prefix and date filters together:

```json
{
  "filePrefix": "fathom-transcript",
  "dateFilter": {
    "startDate": "2025-09-01",
    "endDate": "2025-09-30",
    "enabled": true
  }
}
```

This will download only files that start with "fathom-transcript" AND were modified between September 1-30, 2025.

### Convert Transcripts to Markdown

The script can automatically convert downloaded transcript files (.txt) to formatted markdown (.md) files:

```json
{
  "convertToMarkdown": true,
  "markdownOutputDir": "./markdown-output"
}
```

When enabled, the script will:
1. Download transcript files to the `downloads` directory
2. Convert each .txt file to a formatted .md file
3. Save markdown files to the `markdown-output` directory

The markdown conversion:
- Extracts the date from the filename (supports various date formats)
- Formats speaker entries with timestamps as headers
- Properly structures the transcript content
- Adds a footer with processing timestamp

Example output format:
```markdown
# September 18, 2025

## 0:00 - Speaker Name
Content of what the speaker said...

## 0:30 - Another Speaker
Their response or comment...
```

#### More Examples:

**Last 7 days of September 2025:**
```json
{
  "dateFilter": {
    "startDate": "2025-09-24",
    "endDate": "2025-09-30",
    "enabled": true
  }
}
```

**Single day:**
```json
{
  "dateFilter": {
    "startDate": "2025-09-15",
    "endDate": "2025-09-15",
    "enabled": true
  }
}
```

### Downloaded Files

Files will be downloaded to: `transcripts/downloads/`

When using multiple folders with `organizeByFolder: true`:
- Files are organized into subdirectories named after their source folders
- Example structure:
  ```
  transcripts/
  ├── downloads/
  │   ├── Main Transcripts/         # Files from folder 1
  │   │   ├── fathom-transcript-meeting1.txt
  │   │   └── fathom-transcript-meeting2.txt
  │   ├── Team A Transcripts/       # Files from folder 2
  │   │   └── fathom-transcript-standup.txt
  │   └── Team B Transcripts/       # Files from folder 3
  │       └── fathom-transcript-planning.txt
  └── markdown-output/              # If convertToMarkdown is enabled
      ├── Main Transcripts/
      │   ├── fathom-transcript-meeting1.md
      │   └── fathom-transcript-meeting2.md
      ├── Team A Transcripts/
      │   └── fathom-transcript-standup.md
      └── Team B Transcripts/
          └── fathom-transcript-planning.md
  ```

When `organizeByFolder: false`, all files are placed directly in the downloads directory regardless of their source folder.

## Troubleshooting

- **"Error initializing Google Drive API"**: Check that `service-account-key.json` exists in the main project folder
- **"No files found"**: Verify the folder is shared with the service account email
- **"Permission denied"**: Ensure the service account has at least "Viewer" access to the folder

## Security Note

⚠️ **Never commit the `service-account-key.json` file to version control!** It's already included in `.gitignore`:

```
service-account-key.json
```
