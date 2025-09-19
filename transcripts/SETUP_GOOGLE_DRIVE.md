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
6. **Save this file as `service-account-key.json` in the transcripts folder**

### 4. Share Your Google Drive Folder

1. Copy the service account email from the JSON file (look for the `client_email` field)
2. Go to your Google Drive folder (ID: `1WgzH_coNUo2OVYbjRNnBL1qJ3UG8LtIH`)
3. Right-click the folder and select "Share"
4. Add the service account email address
5. Give it "Viewer" permission
6. Click "Send"

## Configuration

Edit `config.json` to customize the download behavior:

```json
{
  "folderId": "1WgzH_coNUo2OVYbjRNnBL1qJ3UG8LtIH",
  "serviceAccountKeyFile": "./service-account-key.json",
  "downloadDir": "./downloads",
  "filePrefix": "",  // Set to download only files starting with this prefix
  "sanitizeFilenames": true,  // Clean special characters from filenames (recommended for Windows)
  "dateFilter": {
    "startDate": "",   // Format: "YYYY-MM-DD" (e.g., "2025-08-15")
    "endDate": "",     // Format: "YYYY-MM-DD" (e.g., "2025-09-30")
    "enabled": false   // Set to true to enable date filtering
  },
  "convertToMarkdown": false,  // Set to true to convert .txt transcripts to .md format
  "markdownOutputDir": "./markdown-output"  // Directory for converted markdown files
}
```

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

## Troubleshooting

- **"Error initializing Google Drive API"**: Check that `service-account-key.json` exists in the transcripts folder
- **"No files found"**: Verify the folder is shared with the service account email
- **"Permission denied"**: Ensure the service account has at least "Viewer" access to the folder

## Security Note

⚠️ **Never commit the `service-account-key.json` file to version control!** Add it to your `.gitignore` file:

```
transcripts/service-account-key.json
```
