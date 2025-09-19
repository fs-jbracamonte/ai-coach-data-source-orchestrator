const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Load config
const config = require('./config.json');

// Function to make Jira API request
function makeJiraRequest(path, callback) {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  const options = {
    hostname: process.env.JIRA_HOST.replace('https://', '').replace('http://', '').replace(/\/$/, ''),
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  console.log(`Making request to: https://${options.hostname}${options.path}`);

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        callback(null, JSON.parse(data));
      } else {
        console.error(`Error: ${res.statusCode} ${res.statusMessage}`);
        console.error('Response:', data);
        callback(new Error(`HTTP ${res.statusCode}: ${data}`));
      }
    });
  });

  req.on('error', (error) => {
    callback(error);
  });

  req.end();
}

async function exportJiraData() {
  // Check environment variables
  if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN || !process.env.JIRA_HOST) {
    console.error('Missing required environment variables!');
    console.error('Please set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN in your .env file');
    process.exit(1);
  }

  console.log('Connecting to Jira:');
  console.log('Host:', process.env.JIRA_HOST);
  console.log('Email:', process.env.JIRA_EMAIL);
  console.log('API Token:', process.env.JIRA_API_TOKEN ? '***' + process.env.JIRA_API_TOKEN.slice(-4) : 'NOT SET');

  // Check if project is configured
  if (!config.project) {
    console.error('Error: No project specified in config.json');
    console.error('Please add a "project" field with your Jira project key (e.g., "AICD", "PROJ", etc.)');
    process.exit(1);
  }

  // Build JQL query
  const project = config.project;
  const jql = `project = ${project} AND updated >= "${config.start_date}" AND updated <= "${config.end_date}" ORDER BY updated DESC`;
  console.log(`\nJQL Query: ${jql}\n`);

  let allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  // Fetch issues with pagination
  do {
    console.log(`Fetching issues ${startAt + 1} to ${startAt + maxResults}...`);
    
    const searchPath = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=*all`;
    
    await new Promise((resolve, reject) => {
      makeJiraRequest(searchPath, (error, data) => {
        if (error) {
          reject(error);
        } else {
          total = data.total;
          allIssues = allIssues.concat(data.issues);
          console.log(`Retrieved ${allIssues.length} of ${total} issues`);
          resolve();
        }
      });
    }).catch(error => {
      console.error('Failed to fetch issues:', error.message);
      process.exit(1);
    });

    startAt += maxResults;
  } while (startAt < total);

  if (allIssues.length === 0) {
    console.log('No issues found');
    return;
  }

  // Convert to CSV
  console.log('\nConverting to CSV...');
  
  // Get all unique field names
  const allFieldNames = new Set();
  allIssues.forEach(issue => {
    Object.keys(issue.fields).forEach(field => allFieldNames.add(field));
  });

  // Create header row
  const headers = ['key', ...Array.from(allFieldNames).sort()];
  
  // Create data rows
  const rows = allIssues.map(issue => {
    const row = [issue.key];
    
    headers.slice(1).forEach(fieldName => {
      const value = issue.fields[fieldName];
      
      if (value === null || value === undefined) {
        row.push('');
      } else if (typeof value === 'object') {
        if (value.name) {
          row.push(`"${value.name}"`);
        } else if (value.displayName) {
          row.push(`"${value.displayName}"`);
        } else if (value.emailAddress && fieldName === 'assignee') {
          // Special handling for assignee field
          row.push(`"${value.displayName || value.emailAddress}"`);
        } else if (Array.isArray(value)) {
          const arrayValue = value.map(v => v.name || v.value || v).join('; ');
          row.push(`"${arrayValue.replace(/"/g, '""')}"`);
        } else {
          // For complex objects, escape the JSON string properly
          const jsonStr = JSON.stringify(value).replace(/"/g, '""');
          row.push(`"${jsonStr}"`);
        }
      } else {
        // Escape quotes and handle newlines for CSV
        row.push(`"${String(value).replace(/"/g, '""').replace(/\n/g, ' ')}"`);
      }
    });
    
    return row.join(',');
  });

  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write CSV file
  const csvContent = [headers.join(','), ...rows].join('\n');
  const filename = `${project}_${config.start_date}_to_${config.end_date}_export.csv`;
  const filepath = path.join(dataDir, filename);
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`\nExported ${allIssues.length} issues to: ${filepath}`);
}

// Run the export
exportJiraData();
