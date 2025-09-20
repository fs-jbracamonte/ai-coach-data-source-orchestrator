const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Load config
const config = require('../config.json');

async function splitCsvByAssignee() {
  // Check if project is configured
  if (!config.jira.project) {
    console.error('Error: No project specified in config.json');
    console.error('Please add a "project" field with your Jira project key (e.g., "AICD", "PROJ", etc.)');
    process.exit(1);
  }

  const project = config.jira.project;
  const inputFile = path.join(__dirname, 'data', `${project}_${config.jira.start_date}_to_${config.jira.end_date}_export.csv`);
  
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    console.error('Please run export-to-csv.js first to generate the main export file.');
    process.exit(1);
  }
  
  // Check if team_members is configured
  const filterByTeamMembers = config.jira.team_members && Array.isArray(config.jira.team_members) && config.jira.team_members.length > 0;
  
  console.log(`Reading CSV file: ${inputFile}`);
  if (filterByTeamMembers) {
    console.log(`Filtering for team members: ${config.jira.team_members.join(', ')}\n`);
  } else {
    console.log(`No team members specified - including all assignees\n`);
  }
  
  // Read all data first to group by assignee
  const issuesByAssignee = {};
  const headers = [];
  let headersCaptured = false;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('headers', (headerList) => {
        // Capture headers from the CSV
        headers.push(...headerList);
        headersCaptured = true;
      })
      .on('data', (row) => {
        // Get assignee name or use 'Unassigned'
        let assignee = row.assignee || 'Unassigned';
        
        // Clean up assignee name - sometimes it contains extra data
        if (assignee && assignee !== 'Unassigned') {
          // If assignee looks like it has JSON or extra data, try to extract the name
          if (assignee.includes(':') || assignee.includes('{')) {
            // Try to extract name before any special characters
            const match = assignee.match(/^([^{:,]+)/);
            if (match) {
              assignee = match[1].trim();
            }
          }
          // Ensure it's a string
          assignee = String(assignee).trim();
        }
        
        // Process based on whether we're filtering by team members
        if (!filterByTeamMembers || config.jira.team_members.includes(assignee)) {
          // Initialize array for this assignee if not exists
          if (!issuesByAssignee[assignee]) {
            issuesByAssignee[assignee] = [];
          }
          
          // Add issue to assignee's array
          issuesByAssignee[assignee].push(row);
        }
      })
      .on('end', async () => {
        if (Object.keys(issuesByAssignee).length === 0) {
          console.log('No issues found.');
          resolve();
          return;
        }
        
        const assigneeLabel = filterByTeamMembers ? 'team member(s)' : 'assignee(s)';
        console.log(`Found issues for ${Object.keys(issuesByAssignee).length} ${assigneeLabel}:\n`);
        
        // Create output directory
        const outputDir = path.join(__dirname, 'data', 'by-assignee');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Process each assignee
        for (const [assignee, issues] of Object.entries(issuesByAssignee)) {
          console.log(`${assignee}: ${issues.length} issues`);
          
          // Create safe filename (remove special characters)
          const safeAssigneeName = assignee
            .replace(/[^a-z0-9]/gi, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          
          const outputFile = path.join(outputDir, `${project}_${config.jira.start_date}_to_${config.jira.end_date}_${safeAssigneeName}.csv`);
          
          // Prepare headers for csv-writer
          const csvHeaders = headers.map(header => ({
            id: header,
            title: header
          }));
          
          // Create CSV writer
          const csvWriter = createCsvWriter({
            path: outputFile,
            header: csvHeaders
          });
          
          // Write data
          await csvWriter.writeRecords(issues);
          console.log(`  → Exported to: ${path.relative(__dirname, outputFile)}`);
        }
        
        resolve();
      })
      .on('error', (error) => {
        console.error('Error reading CSV:', error);
        reject(error);
      });
  });
}

// Run the split
splitCsvByAssignee()
  .then(() => {
    console.log('\nDone! Check the data/by-assignee/ folder for individual CSV files.');
  })
  .catch((error) => {
    console.error('Failed to split CSV:', error);
    process.exit(1);
  });
