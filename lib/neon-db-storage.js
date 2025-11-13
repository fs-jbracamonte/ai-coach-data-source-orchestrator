require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { computeChecksum } = require('./vercel-blob-uploader');

/**
 * Neon Database Storage Module
 * 
 * Stores generated data sources in Neon PostgreSQL database with:
 * - Feature flag control (ENABLE_NEON_DB_STORAGE)
 * - Requires Vercel Blob upload to be enabled (stores blob references)
 * - Parses markdown outputs to extract metadata
 * - Automatically executes SQL using @neondatabase/serverless
 * - Handles deduplication via unique constraints
 * - Non-fatal error handling (logs warnings but doesn't stop workflow)
 */

/**
 * Check if Neon DB storage is enabled via environment variable
 * @returns {boolean}
 */
function isStorageEnabled() {
  const flag = process.env.ENABLE_NEON_DB_STORAGE;
  return flag === 'true' || flag === '1';
}

/**
 * Check if Vercel Blob upload is enabled (required for Neon storage)
 * @returns {boolean}
 */
function requiresVercelBlob() {
  const flag = process.env.ENABLE_VERCEL_BLOB_UPLOAD;
  return flag === 'true' || flag === '1';
}

/**
 * Get Neon environment name
 * @returns {string}
 */
function getNeonEnv() {
  return process.env.NEON_ENV || 'dev';
}

/**
 * Get DATABASE_URL from environment
 * @returns {string|null}
 */
function getDatabaseUrl() {
  return process.env.DATABASE_URL || null;
}

/**
 * Load UUID cache from environment-specific file
 * @returns {Object}
 */
function loadUUIDCache() {
  const env = getNeonEnv();
  const cacheFile = path.join(__dirname, '..', `.neon-db-ids.${env}.json`);
  
  if (!fs.existsSync(cacheFile)) {
    console.warn(`\n[Neon DB] ⚠ UUID cache file not found: ${cacheFile}`);
    console.warn('[Neon DB] Run: node scripts/seed-neon-db.js first');
    return null;
  }
  
  try {
    const content = fs.readFileSync(cacheFile, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[Neon DB] ✗ Failed to load UUID cache: ${err.message}`);
    return null;
  }
}

/**
 * Get project UUID from cache
 * @param {string} projectFolder - Project folder name
 * @returns {string|null}
 */
function getProjectUUID(projectFolder) {
  const cache = loadUUIDCache();
  if (!cache || !cache.teams) {
    return null;
  }
  
  const uuid = cache.teams[projectFolder];
  if (!uuid) {
    console.warn(`[Neon DB] ⚠ No UUID found for project: ${projectFolder}`);
  }
  
  return uuid;
}

/**
 * Parse date from various filename patterns
 * @param {string} filename - Filename to parse
 * @returns {Date|null}
 */
function parseDateFromFilename(filename) {
  // Try YYYY-MM-DD format (e.g., fathom-transcripts-2025-10-13T...)
  let match = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(match[0]);
  }
  
  // Try MM-DD-YYYY format
  match = filename.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    return new Date(`${match[3]}-${match[1]}-${match[2]}`);
  }
  
  // Try MM_DD_YYYY format
  match = filename.match(/(\d{2})_(\d{2})_(\d{4})/);
  if (match) {
    return new Date(`${match[3]}-${match[1]}-${match[2]}`);
  }
  
  return null;
}

/**
 * Extract author name from daily report markdown
 * @param {string} content - Markdown content
 * @returns {string|null}
 */
function extractAuthorName(content) {
  // Look for "**Employee**: Name" pattern
  const match = content.match(/\*\*Employee\*\*:\s*(.+?)(?:\s+|$)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Split daily report markdown by date sections
 * @param {string} content - Full markdown content
 * @param {string} authorName - Author name
 * @returns {Array<Object>} - Array of {date, content, checksum}
 */
function splitDailyReportByDate(content, authorName) {
  const sections = [];
  
  // Split by date headers (## October 27, 2025 or ## 2025-10-27)
  const dateHeaderRegex = /^## (.+?)$/gm;
  const parts = content.split(dateHeaderRegex);
  
  // First part is the header before any date sections
  for (let i = 1; i < parts.length; i += 2) {
    const dateStr = parts[i].trim();
    const sectionContent = parts[i + 1] ? parts[i + 1].trim() : '';
    
    if (!sectionContent) continue;
    
    // Parse date
    let reportDate = null;
    
    // Try parsing "October 27, 2025" format
    try {
      reportDate = new Date(dateStr);
      if (isNaN(reportDate.getTime())) {
        // Try YYYY-MM-DD format
        const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          reportDate = new Date(match[0]);
        }
      }
    } catch (err) {
      console.warn(`[Neon DB] ⚠ Failed to parse date: ${dateStr}`);
      continue;
    }
    
    if (!reportDate || isNaN(reportDate.getTime())) {
      console.warn(`[Neon DB] ⚠ Invalid date: ${dateStr}`);
      continue;
    }
    
    // Include the date header in the section content
    const fullSectionContent = `## ${dateStr}\n\n${sectionContent}`;
    const checksum = computeChecksum(fullSectionContent);
    
    sections.push({
      date: reportDate.toISOString().split('T')[0], // YYYY-MM-DD
      content: fullSectionContent,
      checksum: checksum
    });
  }
  
  return sections;
}

/**
 * Find blob reference for a file from Vercel upload results
 * @param {string} localPath - Local file path
 * @param {Object} vercelResults - Vercel upload results
 * @returns {Object|null} - {blob_key, blob_url, checksum}
 */
function findBlobReference(localPath, vercelResults) {
  if (!vercelResults) return null;
  
  const normalizedPath = path.normalize(localPath);
  
  // Search through all result types
  const allResults = [
    ...(vercelResults.transcripts?.urls || []),
    ...(vercelResults.dailyReports?.urls || []),
    ...(vercelResults.slack?.urls || []),
    ...(vercelResults.jiraData?.urls || [])
  ];
  
  for (const result of allResults) {
    if (result.localPath && path.normalize(result.localPath) === normalizedPath) {
      return {
        blob_key: result.pathname,
        blob_url: result.url,
        checksum: result.checksum
      };
    }
  }
  
  return null;
}

/**
 * Store all data to Neon database
 * @param {Object} options - Storage options
 * @param {string} options.projectFolder - Project folder name
 * @param {Object} options.config - Config object
 * @param {string} [options.transcriptsDir] - Transcripts directory path
 * @param {string} [options.dailyReportsDir] - Daily reports directory path
 * @param {string} [options.slackDir] - Slack directory path (sanitized)
 * @param {string} [options.jiraDataFile] - Extracted Jira data file path
 * @param {Object} [options.vercelResults] - Vercel upload results with blob references
 * @returns {Promise<Object>} - Storage results
 */
async function storeAllData(options) {
  const {
    projectFolder,
    config,
    transcriptsDir,
    dailyReportsDir,
    slackDir,
    jiraDataFile,
    vercelResults
  } = options;
  
  // Check if storage is enabled
  if (!isStorageEnabled()) {
    console.log('\n[Neon DB] Storage disabled (ENABLE_NEON_DB_STORAGE not set to true)');
    return null;
  }
  
  // Check if Vercel upload is enabled (required)
  if (!requiresVercelBlob()) {
    console.warn('\n[Neon DB] ⚠ Storage enabled but Vercel Blob upload is not enabled.');
    console.warn('[Neon DB] Neon storage requires ENABLE_VERCEL_BLOB_UPLOAD=true');
    console.warn('[Neon DB] Skipping database storage.');
    return null;
  }
  
  // Check if we have Vercel results
  if (!vercelResults) {
    console.warn('\n[Neon DB] ⚠ No Vercel upload results available. Skipping database storage.');
    return null;
  }
  
  // Check DATABASE_URL
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.warn('\n[Neon DB] ⚠ DATABASE_URL not configured in .env');
    console.warn('[Neon DB] Skipping database storage.');
    return null;
  }
  
  console.log('\n=== Storing Data to Neon Database ===\n');
  console.log(`Project: ${projectFolder}`);
  console.log(`Environment: ${getNeonEnv()}`);
  
  // Get project UUID
  const projectUUID = getProjectUUID(projectFolder);
  if (!projectUUID) {
    console.error('[Neon DB] ✗ Could not find project UUID. Run seed script first.');
    return null;
  }
  
  console.log(`Project UUID: ${projectUUID}\n`);
  
  // Initialize Neon SQL client
  const sql = neon(databaseUrl);
  
  const results = {
    dailyReports: { inserted: 0, updated: 0, files: 0 },
    transcripts: { inserted: 0, updated: 0, files: 0 },
    jiraSnapshots: { inserted: 0, updated: 0, files: 0 },
    slackCaptures: { inserted: 0, updated: 0, files: 0 }
  };
  
  try {
    // Process daily reports
    if (dailyReportsDir && fs.existsSync(dailyReportsDir)) {
      console.log('Processing daily reports...');
      const files = fs.readdirSync(dailyReportsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(dailyReportsDir, f));
      
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf8');
        const authorName = extractAuthorName(content);
        
        if (!authorName) {
          console.warn(`  ⚠ Could not extract author from: ${path.basename(filePath)}`);
          continue;
        }
        
        const sections = splitDailyReportByDate(content, authorName);
        const blobRef = findBlobReference(filePath, vercelResults);
        
        for (const section of sections) {
          try {
            // Use INSERT ... ON CONFLICT to handle upserts
            await sql`
              INSERT INTO daily_reports (
                project_id, report_date, content, author_name, checksum_sha256, blob_key, blob_url
              ) VALUES (
                ${projectUUID},
                ${section.date},
                ${section.content},
                ${authorName},
                ${section.checksum},
                ${blobRef?.blob_key || null},
                ${blobRef?.blob_url || null}
              )
              ON CONFLICT (project_id, author_name, report_date) 
              DO UPDATE SET 
                content = EXCLUDED.content,
                checksum_sha256 = EXCLUDED.checksum_sha256,
                blob_key = EXCLUDED.blob_key,
                blob_url = EXCLUDED.blob_url,
                updated_at = NOW()
            `;
            results.dailyReports.inserted++;
          } catch (err) {
            console.error(`  ✗ Failed to insert daily report for ${authorName} on ${section.date}: ${err.message}`);
          }
        }
        
        if (sections.length > 0) {
          results.dailyReports.files++;
          console.log(`  ✓ ${path.basename(filePath)}: ${sections.length} daily sections`);
        }
      }
    }
    
    // Process transcripts
    if (transcriptsDir && fs.existsSync(transcriptsDir)) {
      console.log('\nProcessing transcripts...');
      const files = fs.readdirSync(transcriptsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(transcriptsDir, f));
      
      for (const filePath of files) {
        const filename = path.basename(filePath);
        const transcriptDate = parseDateFromFilename(filename);
        
        if (!transcriptDate) {
          console.warn(`  ⚠ Could not parse date from filename: ${filename}`);
          continue;
        }
        
        const blobRef = findBlobReference(filePath, vercelResults);
        if (!blobRef) {
          console.warn(`  ⚠ No blob reference for transcript: ${filename}`);
          continue;
        }
        
        try {
          const transcriptText = fs.readFileSync(filePath, 'utf8');
          const byteSize = Buffer.byteLength(transcriptText, 'utf8');
          
          await sql`
            INSERT INTO meeting_transcripts (
              project_id, transcript_date, filename, transcript_text,
              blob_key, blob_url, byte_size, checksum_sha256
            ) VALUES (
              ${projectUUID},
              ${transcriptDate.toISOString()},
              ${filename},
              ${transcriptText},
              ${blobRef.blob_key},
              ${blobRef.blob_url},
              ${byteSize},
              ${blobRef.checksum}
            )
            ON CONFLICT (project_id, filename, transcript_date) 
            DO UPDATE SET 
              transcript_text = EXCLUDED.transcript_text,
              blob_key = EXCLUDED.blob_key,
              blob_url = EXCLUDED.blob_url,
              byte_size = EXCLUDED.byte_size,
              checksum_sha256 = EXCLUDED.checksum_sha256,
              updated_at = NOW()
          `;
          
          results.transcripts.inserted++;
          results.transcripts.files++;
          console.log(`  ✓ ${filename}`);
        } catch (err) {
          console.error(`  ✗ Failed to insert transcript ${filename}: ${err.message}`);
        }
      }
    }
    
    // Process Jira snapshot
    if (jiraDataFile && fs.existsSync(jiraDataFile)) {
      console.log('\nProcessing Jira snapshot...');
      const blobRef = findBlobReference(jiraDataFile, vercelResults);
      
      if (blobRef) {
        const startDate = config?.jira?.start_date;
        const endDate = config?.jira?.end_date;
        
        if (startDate && endDate) {
          try {
            const stat = fs.statSync(jiraDataFile);
            const byteSize = stat.size;
            
            await sql`
              INSERT INTO jira_snapshots (
                project_id, collected_week_start, collected_week_end,
                blob_key, blob_url, byte_size, checksum_sha256
              ) VALUES (
                ${projectUUID},
                ${startDate},
                ${endDate},
                ${blobRef.blob_key},
                ${blobRef.blob_url},
                ${byteSize},
                ${blobRef.checksum}
              )
            `;
            
            results.jiraSnapshots.inserted++;
            results.jiraSnapshots.files++;
            console.log(`  ✓ ${path.basename(jiraDataFile)}`);
          } catch (err) {
            console.error(`  ✗ Failed to insert Jira snapshot: ${err.message}`);
          }
        } else {
          console.warn('  ⚠ Missing date range in config for Jira snapshot');
        }
      }
    }
    
    // Process Slack captures
    if (slackDir && fs.existsSync(slackDir)) {
      console.log('\nProcessing Slack captures...');
      const blobRefs = vercelResults.slack?.urls || [];
      
      const startDate = config?.slack?.dateFilter?.start_date;
      const endDate = config?.slack?.dateFilter?.end_date;
      
      if (startDate && endDate && blobRefs.length > 0) {
        for (const blobRef of blobRefs) {
          try {
            // Try to get file size from local file if available
            let byteSize = 0;
            if (blobRef.localPath && fs.existsSync(blobRef.localPath)) {
              const stat = fs.statSync(blobRef.localPath);
              byteSize = stat.size;
            }
            
            await sql`
              INSERT INTO slack_captures (
                project_id, collected_week_start, collected_week_end,
                blob_key, blob_url, byte_size, checksum_sha256
              ) VALUES (
                ${projectUUID},
                ${startDate},
                ${endDate},
                ${blobRef.blob_key || blobRef.pathname},
                ${blobRef.blob_url || blobRef.url},
                ${byteSize},
                ${blobRef.checksum}
              )
            `;
            
            results.slackCaptures.inserted++;
          } catch (err) {
            console.error(`  ✗ Failed to insert Slack capture: ${err.message}`);
          }
        }
        
        results.slackCaptures.files = blobRefs.length;
        console.log(`  ✓ ${blobRefs.length} Slack files`);
      } else {
        console.warn('  ⚠ Missing date range or no blob references for Slack captures');
      }
    }
    
    // Summary
    console.log('\n=== Neon Database Storage Summary ===');
    console.log(`Daily Reports: ${results.dailyReports.inserted} inserted from ${results.dailyReports.files} files`);
    console.log(`Transcripts: ${results.transcripts.inserted} inserted from ${results.transcripts.files} files`);
    console.log(`Jira Snapshots: ${results.jiraSnapshots.inserted} inserted from ${results.jiraSnapshots.files} files`);
    console.log(`Slack Captures: ${results.slackCaptures.inserted} inserted from ${results.slackCaptures.files} files`);
    
    const totalInserted = 
      results.dailyReports.inserted +
      results.transcripts.inserted +
      results.jiraSnapshots.inserted +
      results.slackCaptures.inserted;
    
    if (totalInserted === 0) {
      console.warn('⚠ No records inserted. Check input directories and Vercel upload results.');
    } else {
      console.log(`\n✓ Successfully stored ${totalInserted} records to Neon database`);
    }
    
    return {
      success: true,
      projectUUID,
      results
    };
    
  } catch (error) {
    console.error('[Neon DB] Storage failed:', error.message);
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    console.error('Continuing workflow without database storage...');
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  isStorageEnabled,
  requiresVercelBlob,
  getNeonEnv,
  loadUUIDCache,
  getProjectUUID,
  parseDateFromFilename,
  extractAuthorName,
  splitDailyReportByDate,
  findBlobReference,
  storeAllData
};
