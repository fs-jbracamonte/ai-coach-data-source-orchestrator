const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const transcriptToMarkdown = require('./transcript-to-markdown');

// Load configuration
const config = require('./config.json');

// Configuration from config.json
const FOLDER_ID = config.folderId;
const SERVICE_ACCOUNT_KEY_FILE = config.serviceAccountKeyFile;
const DOWNLOAD_DIR = config.downloadDir;
const FILE_PREFIX = config.filePrefix || '';
const SANITIZE_FILENAMES = config.sanitizeFilenames !== false;
const CONVERT_TO_MARKDOWN = config.convertToMarkdown || false;
const MARKDOWN_OUTPUT_DIR = config.markdownOutputDir || './markdown-output';

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
    // Load service account credentials
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, SERVICE_ACCOUNT_KEY_FILE),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
  } catch (error) {
    console.error('Error initializing Google Drive API:', error.message);
    throw error;
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
    console.error('Error listing files:', error.message);
    throw error;
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
          reject(err);
        })
        .pipe(dest);
    });
  } catch (error) {
    console.error(`Error downloading file ${fileName}:`, error.message);
    throw error;
  }
}

// Download files with a specific prefix
async function downloadFilesWithPrefix(drive, folderId, prefix = '') {
  try {
    // Get all files in the folder
    const files = await listFilesInFolder(drive, folderId);
    
    if (files.length === 0) {
      console.log('No files found in the specified folder.');
      return;
    }

    // Apply filters
    let filteredFiles = files;
    
    // Filter by prefix if specified
    if (prefix) {
      filteredFiles = filteredFiles.filter(file => file.name.startsWith(prefix));
    }
    
    // Filter by date range if enabled
    if (config.dateFilter && config.dateFilter.enabled) {
      const { startDate, endDate } = config.dateFilter;
      if (startDate || endDate) {
        filteredFiles = filteredFiles.filter(file => 
          isWithinDateRange(file.modifiedTime, startDate, endDate)
        );
      }
    }

    if (filteredFiles.length === 0) {
      const filters = [];
      if (prefix) filters.push(`prefix "${prefix}"`);
      if (config.dateFilter?.enabled && (config.dateFilter.startDate || config.dateFilter.endDate)) {
        filters.push(`date range ${config.dateFilter.startDate || 'beginning'} to ${config.dateFilter.endDate || 'now'}`);
      }
      console.log(`No files found with ${filters.join(' and ')}.`);
      return;
    }

    console.log(`Found ${filteredFiles.length} file(s) matching criteria...`);

    // Create download directory if it doesn't exist
    const downloadDir = path.join(__dirname, DOWNLOAD_DIR);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Create markdown output directory if converting to markdown
    const markdownDir = path.join(__dirname, MARKDOWN_OUTPUT_DIR);
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

    console.log(`\n✓ Downloaded ${filteredFiles.length} file(s) to ${downloadDir}`);
    
    if (CONVERT_TO_MARKDOWN && convertedFiles.length > 0) {
      console.log(`✓ Converted ${convertedFiles.length} transcript(s) to markdown in ${markdownDir}`);
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

    // Download files based on configuration
    console.log(`Folder ID: ${FOLDER_ID}`);
    if (FILE_PREFIX) {
      console.log(`File prefix filter: "${FILE_PREFIX}"`);
    }
    if (config.dateFilter?.enabled) {
      const { startDate, endDate } = config.dateFilter;
      if (startDate || endDate) {
        console.log(`Date filter: ${startDate || 'beginning'} to ${endDate || 'now'}`);
      }
    }
    if (CONVERT_TO_MARKDOWN) {
      console.log(`Markdown conversion: Enabled (output to ${MARKDOWN_OUTPUT_DIR})`);
    }
    
    await downloadFilesWithPrefix(drive, FOLDER_ID, FILE_PREFIX);

  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { initializeDrive, downloadFilesWithPrefix };
