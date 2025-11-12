const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

/**
 * Vercel Blob Storage Uploader
 * 
 * Uploads markdown files to Vercel Blob Storage with:
 * - Feature flag control (ENABLE_VERCEL_BLOB_UPLOAD)
 * - Date-range-based filenames to prevent overwrites
 * - Structured path mirroring local structure
 * - Non-fatal error handling (logs warnings but doesn't stop workflow)
 */

/**
 * Check if Vercel Blob upload is enabled via environment variable
 * @returns {boolean}
 */
function isUploadEnabled() {
  const flag = process.env.ENABLE_VERCEL_BLOB_UPLOAD;
  return flag === 'true' || flag === '1';
}

/**
 * Check if we have a valid Blob token
 * @returns {boolean}
 */
function hasValidToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return Boolean(token && token.trim().length > 0);
}

/**
 * Format date range for filename
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {string} - Formatted date range (e.g., "2025-10-27_to_2025-11-02")
 */
function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${startDate}_to_${endDate}`;
}

/**
 * Build blob pathname with date range
 * @param {string} projectFolder - Project folder name
 * @param {string} module - Module name (transcripts, daily-reports, jira, slack)
 * @param {string} filename - Original filename
 * @param {string} dateRange - Formatted date range
 * @returns {string} - Full blob pathname
 */
function buildBlobPathname(projectFolder, module, filename, dateRange) {
  const baseName = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename);
  
  // Add date range if not already in filename
  const hasDateRange = baseName.includes('_to_');
  const newBaseName = hasDateRange ? baseName : `${baseName}_${dateRange}`;
  
  return `${projectFolder}/${module}/${newBaseName}${ext}`;
}

/**
 * Upload a single file to Vercel Blob
 * @param {string} filePath - Local file path
 * @param {string} blobPathname - Destination path in Blob storage
 * @returns {Promise<Object>} - Upload result with url and pathname
 */
async function uploadFile(filePath, blobPathname) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    const result = await put(blobPathname, content, {
      access: 'public',
      contentType: 'text/markdown',
      addRandomSuffix: false // We control versioning with date ranges
    });
    
    return {
      success: true,
      url: result.url,
      pathname: result.pathname,
      localPath: filePath
    };
  } catch (error) {
    console.warn(`  ⚠ Failed to upload ${filePath}:`, error.message);
    return {
      success: false,
      error: error.message,
      localPath: filePath
    };
  }
}

/**
 * Upload all files from a directory
 * @param {string} directory - Local directory path
 * @param {string} projectFolder - Project folder name
 * @param {string} module - Module name (transcripts, daily-reports, jira, slack)
 * @param {Object} config - Config object with date ranges
 * @returns {Promise<Object>} - Upload results
 */
async function uploadDirectory(directory, projectFolder, module, config) {
  if (!fs.existsSync(directory)) {
    console.warn(`  ⚠ Directory not found: ${directory}`);
    return { uploaded: 0, failed: 0, skipped: 0, urls: [] };
  }

  const dateRange = formatDateRange(
    config?.jira?.start_date || config?.dailyReports?.query?.report_date_start,
    config?.jira?.end_date || config?.dailyReports?.query?.report_date_end
  );

  const results = {
    uploaded: 0,
    failed: 0,
    skipped: 0,
    urls: []
  };

  // Recursively find all .md files
  const findMarkdownFiles = (dir, baseDir = dir) => {
    const files = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath, baseDir));
      } else if (item.endsWith('.md')) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({ fullPath, relativePath });
      }
    }
    
    return files;
  };

  const files = findMarkdownFiles(directory);
  console.log(`  Found ${files.length} markdown files in ${directory}`);

  for (const { fullPath, relativePath } of files) {
    const blobPathname = buildBlobPathname(projectFolder, module, relativePath, dateRange);
    
    console.log(`  Uploading: ${relativePath} → ${blobPathname}`);
    const result = await uploadFile(fullPath, blobPathname);
    
    if (result.success) {
      results.uploaded++;
      results.urls.push({ pathname: result.pathname, url: result.url });
      console.log(`    ✓ Uploaded: ${result.url}`);
    } else {
      results.failed++;
    }
  }

  return results;
}

/**
 * Upload a single extracted Jira data file
 * @param {string} filePath - Local file path
 * @param {string} projectFolder - Project folder name
 * @param {Object} config - Config object with date ranges
 * @returns {Promise<Object>} - Upload result
 */
async function uploadJiraData(filePath, projectFolder, config) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Jira data file not found: ${filePath}`);
    return { uploaded: 0, failed: 0, urls: [] };
  }

  const dateRange = formatDateRange(
    config?.jira?.start_date,
    config?.jira?.end_date
  );

  const filename = path.basename(filePath);
  const blobPathname = buildBlobPathname(projectFolder, 'jira', filename, dateRange);
  
  console.log(`  Uploading: ${filename} → ${blobPathname}`);
  const result = await uploadFile(filePath, blobPathname);
  
  if (result.success) {
    console.log(`    ✓ Uploaded: ${result.url}`);
    return {
      uploaded: 1,
      failed: 0,
      urls: [{ pathname: result.pathname, url: result.url }]
    };
  } else {
    return {
      uploaded: 0,
      failed: 1,
      urls: []
    };
  }
}

/**
 * Main upload function to be called from generators
 * @param {Object} options - Upload options
 * @param {string} options.projectFolder - Project folder name
 * @param {Object} options.config - Config object
 * @param {string} [options.transcriptsDir] - Transcripts directory path
 * @param {string} [options.dailyReportsDir] - Daily reports directory path
 * @param {string} [options.slackDir] - Slack directory path (sanitized)
 * @param {string} [options.jiraDataFile] - Extracted Jira data file path
 * @returns {Promise<Object>} - Combined upload results
 */
async function uploadAllData(options) {
  const {
    projectFolder,
    config,
    transcriptsDir,
    dailyReportsDir,
    slackDir,
    jiraDataFile
  } = options;

  // Check if upload is enabled
  if (!isUploadEnabled()) {
    console.log('\n[Vercel Blob] Upload disabled (ENABLE_VERCEL_BLOB_UPLOAD not set to true)');
    return null;
  }

  // Check if token is available
  if (!hasValidToken()) {
    console.warn('\n[Vercel Blob] ⚠ Upload enabled but BLOB_READ_WRITE_TOKEN not found. Skipping upload.');
    return null;
  }

  console.log('\n=== Uploading to Vercel Blob Storage ===\n');

  const allResults = {
    transcripts: null,
    dailyReports: null,
    slack: null,
    jiraData: null
  };

  try {
    // Upload transcripts
    if (transcriptsDir) {
      console.log('Uploading transcripts...');
      allResults.transcripts = await uploadDirectory(transcriptsDir, projectFolder, 'transcripts', config);
      console.log(`  ✓ Transcripts: ${allResults.transcripts.uploaded} uploaded, ${allResults.transcripts.failed} failed\n`);
    }

    // Upload daily reports
    if (dailyReportsDir) {
      console.log('Uploading daily reports...');
      allResults.dailyReports = await uploadDirectory(dailyReportsDir, projectFolder, 'daily-reports', config);
      console.log(`  ✓ Daily reports: ${allResults.dailyReports.uploaded} uploaded, ${allResults.dailyReports.failed} failed\n`);
    }

    // Upload Slack data (sanitized)
    if (slackDir) {
      console.log('Uploading Slack data (sanitized)...');
      allResults.slack = await uploadDirectory(slackDir, projectFolder, 'slack/sanitized', config);
      console.log(`  ✓ Slack: ${allResults.slack.uploaded} uploaded, ${allResults.slack.failed} failed\n`);
    }

    // Upload extracted Jira data
    if (jiraDataFile) {
      console.log('Uploading extracted Jira data...');
      allResults.jiraData = await uploadJiraData(jiraDataFile, projectFolder, config);
      console.log(`  ✓ Jira data: ${allResults.jiraData.uploaded} uploaded, ${allResults.jiraData.failed} failed\n`);
    }

    // Summary
    const totalUploaded = 
      (allResults.transcripts?.uploaded || 0) +
      (allResults.dailyReports?.uploaded || 0) +
      (allResults.slack?.uploaded || 0) +
      (allResults.jiraData?.uploaded || 0);

    const totalFailed = 
      (allResults.transcripts?.failed || 0) +
      (allResults.dailyReports?.failed || 0) +
      (allResults.slack?.failed || 0) +
      (allResults.jiraData?.failed || 0);

    console.log('=== Vercel Blob Upload Summary ===');
    console.log(`Total uploaded: ${totalUploaded}`);
    console.log(`Total failed: ${totalFailed}`);

    if (totalFailed > 0) {
      console.warn('⚠ Some files failed to upload. Check warnings above for details.');
    }

    return allResults;
  } catch (error) {
    console.error('[Vercel Blob] Upload failed:', error.message);
    console.error('Continuing workflow without uploads...');
    return null;
  }
}

module.exports = {
  isUploadEnabled,
  hasValidToken,
  uploadFile,
  uploadDirectory,
  uploadJiraData,
  uploadAllData,
  formatDateRange,
  buildBlobPathname
};

