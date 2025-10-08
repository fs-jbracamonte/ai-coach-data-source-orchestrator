const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load config
const config = require('../lib/config').load();
const { JiraAPIError, ConfigurationError, FileSystemError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');

// Function to make Jira API request (GET)
function makeJiraRequest(path, callback) {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  // Get host from config instead of environment
  const jiraHost = config.jira.host.replace('https://', '').replace('http://', '').replace(/\/$/, '');

  const delays = [1000, 2000, 4000];

  const attemptRequest = (attempt) => {
    const options = {
      hostname: jiraHost,
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
        } else if (res.statusCode === 429 && attempt < delays.length) {
          const delay = delays[attempt];
          console.warn(`Received 429 Too Many Requests. Retrying in ${delay}ms (attempt ${attempt + 1} of ${delays.length}).`);
          setTimeout(() => attemptRequest(attempt + 1), delay);
        } else {
          console.error(`Error: ${res.statusCode} ${res.statusMessage}`);
          console.error('Response:', data);
          callback(new JiraAPIError(`HTTP ${res.statusCode}: ${res.statusMessage}`, {
            statusCode: res.statusCode,
            host: options.hostname,
            path: options.path,
            response: data.substring(0, 500) // First 500 chars of response
          }));
        }
      });
    });

    req.on('error', (error) => {
      callback(new JiraAPIError(`Network error: ${error.message}`, {
        host: options.hostname,
        path: options.path,
        originalError: error.message,
        resolutionSteps: [
          'Check your internet connection',
          'Verify the Jira host is accessible',
          'Check for firewall or proxy restrictions',
          'Ensure the Jira instance URL is correct'
        ]
      }));
    });

    req.end();
  };

  attemptRequest(0);
}

async function fetchAllComments(issueKey) {
  const all = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${maxResults}`;
    const page = await new Promise((resolve, reject) => {
      makeJiraRequest(path, (err, data) => err ? reject(err) : resolve(data));
    });
    const comments = Array.isArray(page.comments) ? page.comments : [];
    all.push(...comments);

    const next = startAt + comments.length;
    if (next >= (page.total || comments.length)) break;
    startAt = next;
  }
  return all;
}

function parseIsoDate(value) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isWithinInclusiveRange(date, start, end) {
  const t = date?.getTime?.();
  return typeof t === 'number' && t >= start.getTime() && t <= end.getTime();
}

function filterCommentsByDateRange(comments, startDate, endDate) {
  return comments.filter(c => {
    const ts = parseIsoDate(c.updated || c.created);
    return ts && isWithinInclusiveRange(ts, startDate, endDate);
  });
}

// Function to make Jira API POST request (for new JQL search endpoint)
function makeJiraPostRequest(path, body, callback) {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  // Get host from config instead of environment
  const jiraHost = config.jira.host.replace('https://', '').replace('http://', '').replace(/\/$/, '');
  
  const postData = JSON.stringify(body);
  
  const options = {
    hostname: jiraHost,
    path: path,
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log(`Making POST request to: https://${options.hostname}${options.path}`);

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
        callback(new JiraAPIError(`HTTP ${res.statusCode}: ${res.statusMessage}`, {
          statusCode: res.statusCode,
          host: options.hostname,
          path: options.path,
          response: data.substring(0, 500) // First 500 chars of response
        }));
      }
    });
  });

  req.on('error', (error) => {
    callback(new JiraAPIError(`Network error: ${error.message}`, {
      host: options.hostname,
      path: options.path,
      originalError: error.message,
      resolutionSteps: [
        'Check your internet connection',
        'Verify the Jira host is accessible',
        'Check for firewall or proxy restrictions',
        'Ensure the Jira instance URL is correct'
      ]
    }));
  });

  req.write(postData);
  req.end();
}

async function exportJiraData() {
  // Check environment variables (remove JIRA_HOST check)
  if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    throw new ConfigurationError('Missing required environment variables', {
      missing: ['JIRA_EMAIL', 'JIRA_API_TOKEN'].filter(v => !process.env[v]),
      resolutionSteps: [
        'Set JIRA_EMAIL in your .env file',
        'Set JIRA_API_TOKEN in your .env file',
        'Generate an API token at: https://id.atlassian.com/manage-profile/security/api-tokens',
        'Copy example.env to .env if you haven\'t already'
      ]
    });
  }

  // Check if jira.host is configured
  if (!config.jira.host) {
    throw new ConfigurationError('No Jira host specified in configuration', {
      field: 'jira.host',
      resolutionSteps: [
        'Add a "host" field under "jira" in your config file',
        'Use domain only (e.g., "company.atlassian.net")',
        'Do not include protocol (http:// or https://)',
        'See config.example.jsonc for reference'
      ]
    });
  }

  console.log('Connecting to Jira:');
  console.log('Host:', config.jira.host);
  console.log('Email:', process.env.JIRA_EMAIL);
  console.log('API Token:', process.env.JIRA_API_TOKEN ? '***' + process.env.JIRA_API_TOKEN.slice(-4) : 'NOT SET');

  // Check if project is configured
  if (!config.jira.project) {
    throw new ConfigurationError('No Jira project specified in configuration', {
      field: 'jira.project',
      resolutionSteps: [
        'Add a "project" field under "jira" in your config file',
        'Use the project key (e.g., "AICD", "PROJ", not the full name)',
        'Find the project key in Jira project settings',
        'See config.example.jsonc for reference'
      ]
    });
  }

  // Build JQL query
  const project = config.jira.project;
  const jql = `project = ${project} AND updated >= "${config.jira.start_date}" ORDER BY updated DESC`;
  console.log(`\nJQL Query: ${jql}\n`);

  let allIssues = [];
  let nextPageToken = null;
  const maxResults = 50;
  let pageCount = 0;

  // Fetch issues with pagination using new API
  do {
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);
    
    // Use new JQL search endpoint: POST /rest/api/3/search/jql
    const searchPath = '/rest/api/3/search/jql';
    const requestBody = {
      jql: jql,
      maxResults: maxResults,
      fields: ['*all'], // Request all fields explicitly
    };
    
    // Add nextPageToken if this is not the first page
    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }
    
    await new Promise((resolve, reject) => {
      makeJiraPostRequest(searchPath, requestBody, (error, data) => {
        if (error) {
          reject(error);
        } else {
          allIssues = allIssues.concat(data.issues);
          nextPageToken = data.nextPageToken || null;
          console.log(`Retrieved ${allIssues.length} issues so far...`);
          resolve();
        }
      });
    }).catch(error => {
      throw error; // Will be caught by outer catch block
    });
  } while (nextPageToken); // Continue while there's a nextPageToken

  if (allIssues.length === 0) {
    console.log('No issues found');
    return;
  }

  const startDate = parseIsoDate(config.jira.start_date);
  const endDate = parseIsoDate(config.jira.end_date);
  if (!startDate || !endDate) {
    throw new ConfigurationError('Invalid jira.start_date or jira.end_date', {
      field: 'jira.start_date/end_date'
    });
  }

  const filteredIssues = [];
  console.log(`Fetching comments for ${allIssues.length} issues...`);
  let i = 0;
  for (const issue of allIssues) {
    i++;
    const comments = await fetchAllComments(issue.key);
    const inRange = filterCommentsByDateRange(comments, startDate, endDate);
    if (inRange.length > 0) {
      issue.fields.comment = { comments: inRange };
      filteredIssues.push(issue);
    }
    if (i % 10 === 0) console.log(`Processed ${i}/${allIssues.length} issues...`);
  }
  allIssues = filteredIssues;
  console.log(`Kept ${allIssues.length} issues after comment-date filtering.`);

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
  const filename = `${project}_${config.jira.start_date}_to_${config.jira.end_date}_export.csv`;
  const filepath = path.join(dataDir, filename);
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`\nExported ${allIssues.length} issues to: ${filepath}`);
}

// Run the export
if (require.main === module) {
  exportJiraData().catch(err => {
    handleError(err, {
      module: 'jira',
      operation: 'export-to-csv',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  });
}

module.exports = exportJiraData;
