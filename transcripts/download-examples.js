const { initializeDrive, downloadFilesWithPrefix } = require('./download-from-drive');
const config = require('../config.json');

async function runExamples() {
  try {
    console.log('Initializing Google Drive API...');
    const drive = await initializeDrive();

    // Example 1: Download using config.json settings
    console.log('\n=== Example 1: Download using config.json settings ===');
    await downloadFilesWithPrefix(drive, config.transcripts.folderId, config.transcripts.filePrefix);

    // Example 2: Override config to download files with specific prefix
    console.log('\n=== Example 2: Downloading files with prefix "AI_Coach_" ===');
    await downloadFilesWithPrefix(drive, config.transcripts.folderId, 'AI_Coach_');

    // Example 3: Download files starting with a date pattern
    console.log('\n=== Example 3: Downloading files with prefix "fathom-" ===');
    await downloadFilesWithPrefix(drive, config.transcripts.folderId, 'fathom-');

    // Example 4: Download files from a specific date range (requires config update)
    // To use this example, update config.json:
    // "dateFilter": { "startDate": "2025-09-01", "endDate": "2025-09-30", "enabled": true }
    console.log('\n=== Example 4: Downloading files from specific date range ===');
    if (config.transcripts.dateFilter?.enabled) {
      console.log(`Using date filter from config: ${config.transcripts.dateFilter.startDate} to ${config.transcripts.dateFilter.endDate}`);
      await downloadFilesWithPrefix(drive, config.transcripts.folderId, config.transcripts.filePrefix);
    } else {
      console.log('Date filtering is disabled in config.json');
    }

    // Example 5: Download and convert transcripts to markdown
    // To use this example, update config.json:
    // "convertToMarkdown": true, "markdownOutputDir": "./markdown-output"
    console.log('\n=== Example 5: Download with markdown conversion ===');
    if (config.transcripts.convertToMarkdown) {
      console.log('Markdown conversion is enabled');
      console.log(`Transcripts will be converted to: ${config.transcripts.markdownOutputDir}`);
      // The conversion happens automatically when downloading .txt files
    } else {
      console.log('To enable markdown conversion, set "convertToMarkdown": true in config.json under transcripts');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// To run specific examples, uncomment:
// runExamples();

// Or run directly from command line:
// node download-examples.js
