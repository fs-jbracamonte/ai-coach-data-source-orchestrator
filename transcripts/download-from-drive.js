const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const transcriptToMarkdown = require('./transcript-to-markdown');

// Load configuration
const config = require('../lib/config').load();
const { GoogleDriveError, FileSystemError, ConfigurationError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');

// Configuration from config.json
// Support both single folderId (backward compatible) and array of folder_ids
const FOLDER_IDS = config.transcripts.folder_ids || 
                   (config.transcripts.folderId ? [config.transcripts.folderId] : []);
const SERVICE_ACCOUNT_KEY_FILE = config.transcripts.serviceAccountKeyFile;
const DOWNLOAD_DIR = config.transcripts.downloadDir;
const FILE_PREFIX = config.transcripts.filePrefix || '';
const SANITIZE_FILENAMES = config.transcripts.sanitizeFilenames !== false;
const CONVERT_TO_MARKDOWN = config.transcripts.convertToMarkdown || false;
const MARKDOWN_OUTPUT_DIR = config.transcripts.markdownOutputDir || './markdown-output';
const ORGANIZE_BY_FOLDER = config.transcripts.organizeByFolder || false;

// Sanitize filename for Windows/cross-platform compatibility
function sanitizeFilename(filename) {
  if (!SANITIZE_FILENAMES) return filename;
  
  // Replace invalid characters with underscores
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')  // Windows invalid chars
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Control characters
    .replace(/^\.+/, '_') // Leading dots
    .replace(/\.+$/, '_') // Trailing dots
    .trim();
}

// Parse date string (YYYY-MM-DD) to Date object
function parseDate(dateStr) {
  if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0); // Start of the day
}

// Get end of day for a date string
function getEndOfDay(dateStr) {
  if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999); // End of the day
}

// Check if a file's modified date is within the specified range
function isWithinDateRange(modifiedTime, startDate, endDate) {
  const fileDate = new Date(modifiedTime);
  
  const start = parseDate(startDate);
  const end = getEndOfDay(endDate);
  
  if (!start && !end) return true; // No date filter
  if (start && fileDate < start) return false;
  if (end && fileDate > end) return false;
  
  return true;
}

// Convert transcript file to markdown
async function convertTranscriptToMarkdown(txtFilePath, filename, outputDir) {
  try {
    // Read the transcript content
    const content = fs.readFileSync(txtFilePath, 'utf8');
    
    // Convert to markdown
    const markdown = transcriptToMarkdown.convertToMarkdown(content, filename);
    
    // Generate markdown filename
    const baseName = path.basename(filename, '.txt');
    const markdownFilename = `${baseName}.md`;
    const markdownPath = path.join(outputDir, markdownFilename);
    
    // Write markdown file
    fs.writeFileSync(markdownPath, markdown);
    
    console.log(`  ✓ Converted: ${filename} → ${markdownFilename}`);
    return markdownPath;
  } catch (error) {
    console.error(`  ✗ Failed to convert ${filename}:`, error.message);
    return null;
  }
}

// Initialize the Google Drive API
async function initializeDrive() {
  try {
    // Check if service account key file exists
    if (!fs.existsSync(path.resolve(SERVICE_ACCOUNT_KEY_FILE))) {
      throw new FileSystemError('Service account key file not found', {
        operation: 'read',
        path: SERVICE_ACCOUNT_KEY_FILE,
        resolutionSteps: [
          'Verify config.transcripts.serviceAccountKeyFile path is correct',
          'Ensure service-account-key.json exists in the project root',
          'Download the key file from Google Cloud Console',
          'See SETUP_GOOGLE_DRIVE.md for setup instructions'
        ]
      });
    }

    // Load service account credentials
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(SERVICE_ACCOUNT_KEY_FILE),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    throw new GoogleDriveError(`Error initializing Google Drive API: ${error.message}`, {
      serviceAccountKeyFile: SERVICE_ACCOUNT_KEY_FILE,
      originalError: error.message,
      resolutionSteps: [
        'Verify service-account-key.json is valid JSON',
        'Ensure the service account has Google Drive API enabled',
        'Check that credentials are not expired',
        'See SETUP_GOOGLE_DRIVE.md for setup instructions'
      ]
    });
  }
}

// List all files in the specified folder
async function listFilesInFolder(drive, folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      pageSize: 1000,
    });

    return res.data.files;
  } catch (error) {
    const statusCode = error.response?.status || error.code;
    throw new GoogleDriveError(`Error listing files in folder: ${error.message}`, {
      statusCode,
      folderId,
      originalError: error.message
    });
  }
}

// Download a single file
async function downloadFile(drive, fileId, fileName, downloadPath) {
  try {
    const dest = fs.createWriteStream(downloadPath);
    
    const res = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      res.data
        .on('end', () => {
          console.log(`✓ Downloaded: ${fileName}`);
          resolve();
        })
        .on('error', err => {
          console.error(`✗ Error downloading ${fileName}:`, err.message);
          reject(new GoogleDriveError(`Download stream error: ${err.message}`, {
            fileId,
            fileName,
            downloadPath
          }));
        })
        .pipe(dest);
    });
  } catch (error) {
    const statusCode = error.response?.status || error.code;
    throw new GoogleDriveError(`Error downloading file ${fileName}: ${error.message}`, {
      statusCode,
      fileId,
      fileName,
      downloadPath,
      originalError: error.message
    });
  }
}

// Get folder name from folder ID (using the folder's metadata)
async function getFolderName(drive, folderId) {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'name'
    });
    return res.data.name;
  } catch (error) {
    console.error(`Error getting folder name for ${folderId}:`, error.message);
    // Fallback to folder ID if name retrieval fails
    // This is not critical, so we just log and continue
    return folderId;
  }
}

// Download files with a specific prefix from a single folder
async function downloadFilesFromFolder(drive, folderId, folderName, prefix = '') {
  try {
    console.log(`\nProcessing folder: ${folderName} (${folderId})`);
    
    // Get all files in the folder
    const files = await listFilesInFolder(drive, folderId);
    
    if (files.length === 0) {
      console.log(`  No files found in folder "${folderName}".`);
      return { downloaded: 0, converted: 0 };
    }

    // Apply filters
    let filteredFiles = files;
    
    // Filter by prefix if specified
    if (prefix) {
      filteredFiles = filteredFiles.filter(file => file.name.startsWith(prefix));
    }
    
    // Filter by date range if enabled
    if (config.transcripts.dateFilter && config.transcripts.dateFilter.enabled) {
      const { startDate, endDate } = config.transcripts.dateFilter;
      if (startDate || endDate) {
        filteredFiles = filteredFiles.filter(file => 
          isWithinDateRange(file.modifiedTime, startDate, endDate)
        );
      }
    }

    if (filteredFiles.length === 0) {
      const filters = [];
      if (prefix) filters.push(`prefix "${prefix}"`);
      if (config.transcripts.dateFilter?.enabled && (config.transcripts.dateFilter.startDate || config.transcripts.dateFilter.endDate)) {
        filters.push(`date range ${config.transcripts.dateFilter.startDate || 'beginning'} to ${config.transcripts.dateFilter.endDate || 'now'}`);
      }
      console.log(`  No files found with ${filters.join(' and ')} in folder "${folderName}".`);
      return { downloaded: 0, converted: 0 };
    }

    console.log(`  Found ${filteredFiles.length} file(s) matching criteria...`);

    // Determine download directory
    const baseDownloadDir = path.resolve(DOWNLOAD_DIR);
    const downloadDir = ORGANIZE_BY_FOLDER 
      ? path.join(baseDownloadDir, sanitizeFilename(folderName))
      : baseDownloadDir;
    
    // Create download directory if it doesn't exist
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Determine markdown output directory
    const baseMarkdownDir = path.resolve(MARKDOWN_OUTPUT_DIR);
    const markdownDir = ORGANIZE_BY_FOLDER 
      ? path.join(baseMarkdownDir, sanitizeFilename(folderName))
      : baseMarkdownDir;
    
    // Create markdown output directory if converting to markdown
    if (CONVERT_TO_MARKDOWN && !fs.existsSync(markdownDir)) {
      fs.mkdirSync(markdownDir, { recursive: true });
    }

    // Download each file
    const convertedFiles = [];
    for (const file of filteredFiles) {
      const safeFilename = sanitizeFilename(file.name);
      const downloadPath = path.join(downloadDir, safeFilename);
      await downloadFile(drive, file.id, safeFilename, downloadPath);

      // Convert to markdown if enabled
      if (CONVERT_TO_MARKDOWN && safeFilename.endsWith('.txt')) {
        const markdownPath = await convertTranscriptToMarkdown(downloadPath, safeFilename, markdownDir);
        if (markdownPath) {
          convertedFiles.push(path.basename(markdownPath));
        }
      }
    }

    console.log(`  ✓ Downloaded ${filteredFiles.length} file(s) to ${downloadDir}`);
    
    if (CONVERT_TO_MARKDOWN && convertedFiles.length > 0) {
      console.log(`  ✓ Converted ${convertedFiles.length} transcript(s) to markdown`);
    }

    return { downloaded: filteredFiles.length, converted: convertedFiles.length };
  } catch (error) {
    console.error(`Error processing folder "${folderName}":`, error.message);
    return { downloaded: 0, converted: 0 };
  }
}

// Download files with a specific prefix from multiple folders
async function downloadFilesWithPrefix(drive, folderIds, prefix = '') {
  try {
    console.log(`Processing ${folderIds.length} folder(s)...`);
    
    let totalDownloaded = 0;
    let totalConverted = 0;

    // Process each folder
    for (const folderId of folderIds) {
      // Get folder name for better logging and organization
      const folderName = await getFolderName(drive, folderId);
      
      // Download files from this folder
      const { downloaded, converted } = await downloadFilesFromFolder(
        drive, 
        folderId, 
        folderName, 
        prefix
      );
      
      totalDownloaded += downloaded;
      totalConverted += converted;
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Total files downloaded: ${totalDownloaded}`);
    if (CONVERT_TO_MARKDOWN && totalConverted > 0) {
      console.log(`Total files converted to markdown: ${totalConverted}`);
    }
    if (ORGANIZE_BY_FOLDER) {
      console.log(`Files organized by folder in: ${DOWNLOAD_DIR}`);
    }
  } catch (error) {
    console.error('Error in download process:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('Initializing Google Drive API...');
    const drive = await initializeDrive();

    // Validate configuration
    if (!FOLDER_IDS || FOLDER_IDS.length === 0) {
      throw new ConfigurationError('No Google Drive folder IDs specified in configuration', {
        field: 'transcripts.folder_ids or transcripts.folderId',
        resolutionSteps: [
          'Add "folder_ids" array to the transcripts section in your config file',
          'Or add "folderId" (single folder, backward compatible)',
          'Get folder IDs from Google Drive folder URLs',
          'See config.example.jsonc for reference'
        ]
      });
    }

    // Download files based on configuration
    console.log(`Folder IDs: ${FOLDER_IDS.length} folder(s) configured`);
    if (FILE_PREFIX) {
      console.log(`File prefix filter: "${FILE_PREFIX}"`);
    }
    if (config.transcripts.dateFilter?.enabled) {
      const { startDate, endDate } = config.transcripts.dateFilter;
      if (startDate || endDate) {
        console.log(`Date filter: ${startDate || 'beginning'} to ${endDate || 'now'}`);
      }
    }
    if (CONVERT_TO_MARKDOWN) {
      console.log(`Markdown conversion: Enabled (output to ${MARKDOWN_OUTPUT_DIR})`);
    }
    if (ORGANIZE_BY_FOLDER) {
      console.log(`Folder organization: Enabled`);
    }
    
    await downloadFilesWithPrefix(drive, FOLDER_IDS, FILE_PREFIX);

  } catch (error) {
    handleError(error, {
      module: 'transcripts',
      operation: 'download-from-drive',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { initializeDrive, downloadFilesWithPrefix };
