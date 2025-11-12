const fs = require('fs');
const path = require('path');

/**
 * Jira Data Extractor
 * 
 * Extracts JIRA_DATA content from generated datasource.py files
 * and writes it to separate markdown files for upload to Vercel Blob.
 * 
 * Supports all datasource types: weekly, team, 1on1, dashboard
 */

/**
 * Extract JIRA_DATA from a datasource.py file
 * @param {string} filePath - Path to the datasource.py file
 * @returns {string|null} - Extracted JIRA data or null if not found
 */
function extractJiraData(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Datasource file not found: ${filePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Match JIRA_DATA = """..."""
    // Handle escaped triple quotes: \\"""
    const match = content.match(/JIRA_DATA\s*=\s*"""([\s\S]*?)"""\s*\n/);
    
    if (!match || !match[1]) {
      console.warn(`  ⚠ No JIRA_DATA found in ${filePath}`);
      return null;
    }
    
    // Unescape triple quotes
    const jiraData = match[1].replace(/\\"""/g, '"""');
    
    return jiraData.trim();
  } catch (error) {
    console.error(`  ✗ Error reading ${filePath}:`, error.message);
    return null;
  }
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
 * Build output filename for extracted Jira data
 * @param {string} projectFolder - Project folder name
 * @param {string} reportType - Report type (weekly, team, 1on1, dashboard)
 * @param {string} dateRange - Formatted date range
 * @param {string} memberName - Member name (for 1on1 reports)
 * @returns {string} - Output filename
 */
function buildOutputFilename(projectFolder, reportType, dateRange, memberName = null) {
  if (reportType === '1on1' && memberName) {
    const safeName = memberName.toLowerCase().replace(/\s+/g, '_');
    return `jira_data_${reportType}_${safeName}_${dateRange}.md`;
  }
  return `jira_data_${reportType}_${dateRange}.md`;
}

/**
 * Extract and save Jira data from a datasource.py file
 * @param {string} datasourcePath - Path to the datasource.py file
 * @param {string} outputDir - Output directory (typically jira/md_output/{projectFolder})
 * @param {Object} config - Config object with date ranges
 * @param {string} reportType - Report type (weekly, team, 1on1, dashboard)
 * @param {string} memberName - Member name (for 1on1 reports)
 * @returns {string|null} - Path to the extracted file or null if failed
 */
function extractAndSave(datasourcePath, outputDir, config, reportType, memberName = null) {
  console.log(`\n=== Extracting Jira Data from Datasource ===`);
  console.log(`Source: ${datasourcePath}`);
  
  // Extract the data
  const jiraData = extractJiraData(datasourcePath);
  
  if (!jiraData) {
    console.warn('  ⚠ No Jira data to extract');
    return null;
  }
  
  // Build output filename
  const { getProjectFolder } = require('./project-folder');
  const projectFolder = getProjectFolder(process.env.TEAM, config);
  
  const dateRange = formatDateRange(
    config?.jira?.start_date,
    config?.jira?.end_date
  );
  
  const filename = buildOutputFilename(projectFolder, reportType, dateRange, memberName);
  const outputPath = path.join(outputDir, filename);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write the extracted data
  try {
    fs.writeFileSync(outputPath, jiraData);
    console.log(`  ✓ Extracted Jira data saved to: ${outputPath}`);
    console.log(`  Size: ${jiraData.length} characters`);
    return outputPath;
  } catch (error) {
    console.error(`  ✗ Failed to write ${outputPath}:`, error.message);
    return null;
  }
}

/**
 * Extract Jira data from all datasource.py files in a directory
 * @param {string} datasourceDir - Directory containing datasource.py files
 * @param {string} outputDir - Output directory
 * @param {Object} config - Config object
 * @param {string} reportType - Report type
 * @returns {Array<string>} - Array of extracted file paths
 */
function extractFromDirectory(datasourceDir, outputDir, config, reportType) {
  if (!fs.existsSync(datasourceDir)) {
    console.warn(`  ⚠ Datasource directory not found: ${datasourceDir}`);
    return [];
  }

  const files = fs.readdirSync(datasourceDir)
    .filter(f => f.endsWith('.py'))
    .map(f => path.join(datasourceDir, f));

  console.log(`\n=== Extracting Jira Data from ${files.length} datasource(s) ===`);

  const extractedPaths = [];
  
  for (const filePath of files) {
    // Try to extract member name from filename for 1on1 reports
    let memberName = null;
    if (reportType === '1on1') {
      const basename = path.basename(filePath, '.py');
      // Pattern: datasource_<member>.py
      const match = basename.match(/datasource_(.+)$/);
      if (match) {
        memberName = match[1];
      }
    }
    
    const extractedPath = extractAndSave(filePath, outputDir, config, reportType, memberName);
    if (extractedPath) {
      extractedPaths.push(extractedPath);
    }
  }

  if (extractedPaths.length > 0) {
    console.log(`\n✓ Extracted ${extractedPaths.length} Jira data file(s)`);
  } else {
    console.warn('\n⚠ No Jira data files extracted');
  }

  return extractedPaths;
}

module.exports = {
  extractJiraData,
  extractAndSave,
  extractFromDirectory,
  formatDateRange,
  buildOutputFilename
};

