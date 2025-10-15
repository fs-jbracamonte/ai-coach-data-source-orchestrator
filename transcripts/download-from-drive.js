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
const { getProjectFolder } = require('../lib/project-folder');
const PROJECT_FOLDER = getProjectFolder(process.env.TEAM, config);
const DOWNLOAD_DIR = path.join(config.transcripts.downloadDir, PROJECT_FOLDER);
const FILE_PREFIX = config.transcripts.filePrefix || '';
const SANITIZE_FILENAMES = config.transcripts.sanitizeFilenames !== false;
const CONVERT_TO_MARKDOWN = config.transcripts.convertToMarkdown || false;
const MARKDOWN_OUTPUT_DIR = path.join(config.transcripts.markdownOutputDir || './markdown-output', PROJECT_FOLDER);
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

/**
 * Extract date from filename using multiple format patterns.
 * Tries to parse dates in various formats commonly found in transcript filenames.
 * 
 * Supported formats:
 * - MM_DD_YY (09_24_25)
 * - MM-DD-YY (09-24-25)
 * - YYYY-MM-DD (2025-09-24)
 * - YYYY_MM_DD (2025_09_24)
 * - MM/DD/YY (converted to MM_DD_YY in filename)
 * - And other common variations
 * 
 * @param {string} filename - The filename to parse
 * @returns {Date|null} - Parsed date or null if no valid date found
 */
function extractDateFromFilename(filename) {
  // Remove file extension for cleaner parsing
  const nameWithoutExt = filename.replace(/\.(txt|md)$/i, '');
  
  // Try different date patterns (order matters - most specific first)
  // Supports separators: - _ / (hyphen, underscore, slash)
  const patterns = [
    // YYYY-MM-DD or YYYY_MM_DD or YYYY/MM/DD (2025-09-24, 2025_09_24, 2025/09/24)
    {
      regex: /(\d{4})[-_/](\d{2})[-_/](\d{2})/,
      parser: (match) => {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[3], 10);
        return new Date(year, month, day);
      }
    },
    // MM-DD-YYYY or MM_DD_YYYY or MM/DD/YYYY (09-24-2025, 09_24_2025, 09/24/2025) - Must come before MM-DD-YY!
    {
      regex: /(\d{2})[-_/](\d{2})[-_/](\d{4})/,
      parser: (match) => {
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        return new Date(year, month, day);
      }
    },
    // MM-DD-YY or MM_DD_YY or MM/DD/YY (09-24-25, 09_24_25, 09/24/25) - Less specific, check last
    {
      regex: /(\d{2})[-_/](\d{2})[-_/](\d{2})/,
      parser: (match) => {
        const month = parseInt(match[1], 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);
        
        // Convert 2-digit year to 4-digit (assume 2000s)
        if (year < 100) {
          year += 2000;
        }
        
        return new Date(year, month, day);
      }
    }
  ];
  
  // Try each pattern
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern.regex);
    if (match) {
      try {
        const date = pattern.parser(match);
        
        // Validate the date is reasonable (not invalid date, not too far in past/future)
        if (date && !isNaN(date.getTime())) {
          const year = date.getFullYear();
          // Reasonable range: 2020-2030
          if (year >= 2020 && year <= 2030) {
            return date;
          }
        }
      } catch (err) {
        // If parsing fails, try next pattern
        continue;
      }
    }
  }
  
  return null; // No valid date found
}

/**
 * Check if a file is within the specified date range.
 * Priority:
 * 1. Try to extract date from filename (most reliable)
 * 2. Fall back to file's modified date (less reliable due to user modifications)
 * 
 * @param {string} filename - The filename to check
 * @param {string} modifiedTime - The file's modified timestamp
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {boolean} - True if file is within range
 */
function isWithinDateRange(filename, modifiedTime, startDate, endDate) {
  // First, try to extract date from filename
  let fileDate = extractDateFromFilename(filename);
  
  // If no date in filename, fall back to modified date
  if (!fileDate) {
    fileDate = new Date(modifiedTime);
  }
  
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
    let content;
    try {
      content = fs.readFileSync(txtFilePath, 'utf8');
    } catch (readError) {
      throw new FileSystemError(`Failed to read transcript file: ${filename}`, {
        operation: 'read',
        filePath: txtFilePath,
        originalError: readError.message,
        resolutionSteps: [
          'Check if the file exists',
          'Verify file permissions',
          'Ensure the file is not locked by another process'
        ]
      });
    }
    
    // Check if content is valid (not empty, not corrupt)
    if (!content || content.trim().length === 0) {
      console.warn(`  ⚠ Empty transcript file: ${filename} - skipping`);
      return null;
    }
    
    // Extract participants from the content with error handling
    let participants = [];
    try {
      participants = transcriptToMarkdown.extractParticipants(content);
      
      // Log warning if no participants detected
      if (!participants || participants.length === 0) {
        console.warn(`  ⚠ No participants detected in: ${filename} - converting anyway`);
      }
    } catch (extractError) {
      console.warn(`  ⚠ Failed to extract participants from ${filename}: ${extractError.message}`);
      console.warn(`     Converting without participant list...`);
      // Continue with empty participants array
      participants = [];
    }
    
    // Convert to markdown with participants included
    const markdown = transcriptToMarkdown.convertToMarkdown(content, filename, participants);
    
    // Generate markdown filename
    const baseName = path.basename(filename, '.txt');
    const markdownFilename = `${baseName}.md`;
    const markdownPath = path.join(outputDir, markdownFilename);
    
    // Write markdown file with error handling
    try {
      fs.writeFileSync(markdownPath, markdown);
    } catch (writeError) {
      throw new FileSystemError(`Failed to write markdown file: ${markdownFilename}`, {
        operation: 'write',
        filePath: markdownPath,
        originalError: writeError.message,
        resolutionSteps: [
          'Check directory permissions',
          'Ensure sufficient disk space',
          'Verify the output directory exists'
        ]
      });
    }
    
    // Log conversion with participant count
    const participantInfo = participants.length > 0 ? ` (${participants.length} participants)` : ' (no participants detected)';
    console.log(`  ✓ Converted: ${filename} → ${markdownFilename}${participantInfo}`);
    return { markdownPath, participants };
  } catch (error) {
    if (error instanceof FileSystemError) {
      console.error(`  ✗ ${error.message}`);
    } else {
      console.error(`  ✗ Failed to convert ${filename}:`, error.message);
    }
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
    // Check if this is a multi-project folder requiring team filtering
    // Handle missing multiProjectFolders config gracefully - treat as empty array
    const multiProjectFolders = config.transcripts.multiProjectFolders || [];
    const isMultiProjectFolder = multiProjectFolders.includes(folderId);
    const filterByTeam = config.transcripts.filterByTeamMembers || false;
    const teamMembers = config.transcripts.teamMembers || [];
    
    // Validate team filtering configuration
    let teamFilterActive = false;
    let teamMappingLoaded = null;
    
    if (filterByTeam && teamMembers.length > 0 && isMultiProjectFolder) {
      // Try to load team mapping file
      const mappingFile = config.transcripts.teamMappingFile || 'datasource-generator/team-name-mapping.json';
      
      try {
        // This will be needed when actual filtering is implemented
        // For now, we just validate the file can be found
        const mappingPath = path.resolve(mappingFile);
        if (!fs.existsSync(mappingPath)) {
          console.warn(`  ⚠ Team mapping file not found: ${mappingFile}`);
          console.warn(`     Team filtering will be disabled for this folder`);
          teamFilterActive = false;
        } else {
          teamFilterActive = true;
          // teamMappingLoaded would be set here when actual filtering is implemented
        }
      } catch (mappingError) {
        console.warn(`  ⚠ Error loading team mapping file: ${mappingError.message}`);
        console.warn(`     Team filtering will be disabled for this folder`);
        teamFilterActive = false;
      }
    }
    
    // Log folder processing with filtering status
    if (teamFilterActive) {
      console.log(`\n📁 Folder: ${folderName} (${folderId})`);
      console.log(`   Multi-project folder - team filtering ACTIVE`);
    } else if (isMultiProjectFolder) {
      console.log(`\n📁 Folder: ${folderName} (${folderId})`);
      console.log(`   Multi-project folder - team filtering NOT CONFIGURED`);
    } else {
      console.log(`\n📁 Folder: ${folderName} (${folderId})`);
      console.log(`   Single project folder - downloading all transcripts`);
    }
    
    // Get all files in the folder
    const files = await listFilesInFolder(drive, folderId);
    
    if (files.length === 0) {
      console.log(`  No files found in folder "${folderName}".`);
      return { 
        downloaded: 0, 
        converted: 0,
        teamFilterStats: { evaluated: 0, excluded: 0 }
      };
    }

    // Apply filters
    let filteredFiles = files;
    
    // Filter by prefix if specified (case-insensitive, matches anywhere in filename)
    if (prefix) {
      const prefixLower = prefix.toLowerCase();
      filteredFiles = filteredFiles.filter(file => 
        file.name.toLowerCase().includes(prefixLower)
      );
    }
    
    // Filter by date range if enabled
    if (config.transcripts.dateFilter && config.transcripts.dateFilter.enabled) {
      const { startDate, endDate } = config.transcripts.dateFilter;
      if (startDate || endDate) {
        filteredFiles = filteredFiles.filter(file => 
          isWithinDateRange(file.name, file.modifiedTime, startDate, endDate)
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
      return { 
        downloaded: 0, 
        converted: 0,
        teamFilterStats: { evaluated: 0, excluded: 0 }
      };
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

    // ========================================
    // DOWNLOAD AND FINAL FILTER
    // ========================================
    console.log(`\n  📥 Downloading and processing ${filteredFiles.length} file(s)...`);
    
    const convertedFiles = [];
    let teamFilterStats = { evaluated: 0, excluded: 0 };
    
    for (const file of filteredFiles) {
      const safeFilename = sanitizeFilename(file.name);
      const downloadPath = path.join(downloadDir, safeFilename);
      await downloadFile(drive, file.id, safeFilename, downloadPath);

      // Apply final team filtering if active (checks actual participant list)
      let shouldInclude = true;
      if (teamFilterActive && CONVERT_TO_MARKDOWN && safeFilename.endsWith('.txt')) {
        teamFilterStats.evaluated++;
        
        try {
          // Read and extract participants from the downloaded file
          const content = fs.readFileSync(downloadPath, 'utf8');
          const participants = transcriptToMarkdown.extractParticipants(content);
          
          // Load team mapping and check if transcript has enough team members
          const nameMatcher = require('../lib/name-matcher');
          const mapping = nameMatcher.loadTeamMapping(teamMappingLoaded || config.transcripts.teamMappingFile || 'datasource-generator/team-name-mapping.json');
          const minimumRequired = config.transcripts.minimumTeamMembersRequired || 1;
          
          const filterResult = nameMatcher.filterParticipantsByTeam(
            participants,
            teamMembers,
            mapping,
            minimumRequired
          );
          
          shouldInclude = filterResult.shouldInclude;
          
          if (!shouldInclude) {
            teamFilterStats.excluded++;
            console.log(`  ⊘ Final skip: ${safeFilename} - ${filterResult.matches.length}/${minimumRequired} team members (${filterResult.matches.join(', ') || 'none'})`);
            // Delete the downloaded file since it doesn't meet criteria
            fs.unlinkSync(downloadPath);
            continue; // Skip conversion
          } else {
            console.log(`  ✓ Final match: ${safeFilename} - ${filterResult.matches.length} team members (${filterResult.matches.join(', ')})`);
          }
        } catch (filterError) {
          // If filtering fails, include by default (fail-open)
          console.warn(`  ⚠ Could not apply team filter to ${safeFilename}: ${filterError.message} - including by default`);
        }
      }

      // Convert to markdown if enabled and passed team filter
      if (CONVERT_TO_MARKDOWN && safeFilename.endsWith('.txt') && shouldInclude) {
        const result = await convertTranscriptToMarkdown(downloadPath, safeFilename, markdownDir);
        if (result && result.markdownPath) {
          convertedFiles.push(path.basename(result.markdownPath));
        }
      }
    }

    console.log(`\n  ✓ Downloaded ${filteredFiles.length} file(s) to ${downloadDir}`);
    
    if (CONVERT_TO_MARKDOWN && convertedFiles.length > 0) {
      console.log(`  ✓ Converted ${convertedFiles.length} transcript(s) to markdown`);
    }
    
    // Log team filtering summary
    if (teamFilterActive && teamFilterStats.evaluated > 0) {
      const finalMatched = teamFilterStats.evaluated - teamFilterStats.excluded;
      console.log(`\n  📊 Team Filtering Summary:`);
      console.log(`     Files evaluated: ${teamFilterStats.evaluated}`);
      console.log(`     Matched criteria: ${finalMatched}`);
      console.log(`     Excluded (insufficient members): ${teamFilterStats.excluded}`);
    }

    return { 
      downloaded: filteredFiles.length, 
      converted: convertedFiles.length,
      teamFilterStats: teamFilterStats
    };
  } catch (error) {
    console.error(`Error processing folder "${folderName}":`, error.message);
    return { 
      downloaded: 0, 
      converted: 0,
      teamFilterStats: { evaluated: 0, excluded: 0 }
    };
  }
}

// Download files with a specific prefix from multiple folders
async function downloadFilesWithPrefix(drive, folderIds, prefix = '') {
  try {
    console.log(`Processing ${folderIds.length} folder(s)...`);
    
    let totalDownloaded = 0;
    let totalConverted = 0;
    let totalEvaluated = 0;
    let totalExcluded = 0;

    // Process each folder
    for (const folderId of folderIds) {
      // Get folder name for better logging and organization
      const folderName = await getFolderName(drive, folderId);
      
      // Download files from this folder
      const { downloaded, converted, teamFilterStats } = await downloadFilesFromFolder(
        drive, 
        folderId, 
        folderName, 
        prefix
      );
      
      totalDownloaded += downloaded;
      totalConverted += converted;
      
      // Aggregate team filtering statistics
      if (teamFilterStats) {
        totalEvaluated += teamFilterStats.evaluated;
        totalExcluded += teamFilterStats.excluded;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total files downloaded: ${totalDownloaded}`);
    if (CONVERT_TO_MARKDOWN && totalConverted > 0) {
      console.log(`Total files converted to markdown: ${totalConverted}`);
    }
    
    // Team filtering summary
    if (totalEvaluated > 0) {
      console.log(`\n👥 Team Filtering Summary:`);
      console.log(`   Files evaluated: ${totalEvaluated}`);
      console.log(`   Matched: ${totalEvaluated - totalExcluded}`);
      console.log(`   Excluded: ${totalExcluded}`);
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
    
    // Log team filtering configuration
    const multiProjectFolders = config.transcripts.multiProjectFolders || [];
    const teamMembers = config.transcripts.teamMembers || [];
    const filterByTeam = config.transcripts.filterByTeamMembers || false;
    const minRequired = config.transcripts.minimumTeamMembersRequired || 1;
    
    if (filterByTeam && teamMembers.length > 0 && multiProjectFolders.length > 0) {
      console.log(`\n👥 Team filtering: ENABLED for ${multiProjectFolders.length} multi-project folder(s)`);
      console.log(`   Multi-project folders: ${multiProjectFolders.join(', ')}`);
      console.log(`   Team members configured: ${teamMembers.length} members`);
      console.log(`   Minimum team members required: ${minRequired}`);
      console.log(`   Team mapping file: ${config.transcripts.teamMappingFile || 'team-name-mapping.json'}`);
    } else if (filterByTeam && teamMembers.length > 0) {
      console.log(`\n👥 Team filtering: CONFIGURED but no multi-project folders specified`);
      console.log(`   Team members configured: ${teamMembers.length} members`);
      console.log(`   Note: Filtering only applies to folders listed in multiProjectFolders`);
    } else {
      console.log(`\n👥 Team filtering: DISABLED (no multi-project folders configured)`);
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

module.exports = { 
  initializeDrive, 
  downloadFilesWithPrefix
};
