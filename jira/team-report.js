const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config();

// Load config
const config = require('../lib/config').load();
const { getChangelogBullets } = require('./lib/changelog-markdown');

/**
 * Parse complex JSON fields from Jira export
 */
function parseComplexField(value) {
  if (!value || typeof value !== 'string') return value;
  
  // Try to parse JSON objects
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch (e) {
      // If parsing fails, return as is
      return value;
    }
  }
  
  return value;
}

/**
 * Format a date string from Jira format
 */
function formatDate(dateString) {
  if (!dateString || dateString.trim() === '') return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Convert Jira markup to Markdown
 */
function convertJiraMarkupToMarkdown(text) {
  if (!text) return '';
  
  let markdown = text;
  
  // Convert JIRA color markup {color:#FF991F}text{color} to just text
  markdown = markdown.replace(/\{color:[^}]*\}(.*?)\{color\}/g, '$1');
  
  // Convert JIRA headers (h1. h2. etc) to markdown headers
  markdown = markdown.replace(/^h([1-6])\.\s+(.*)$/gm, (match, level, content) => {
    return '#'.repeat(parseInt(level)) + ' ' + content;
  });
  
  // Convert JIRA bold *text* to markdown **text**
  markdown = markdown.replace(/\*([^*]+)\*/g, '**$1**');
  
  // Convert JIRA lists
  markdown = markdown.replace(/^#\s+(.*)$/gm, '1. $1');
  markdown = markdown.replace(/^\*\s+(.*)$/gm, '- $1');
  
  // Handle JIRA links [text|url] to markdown [text](url)
  markdown = markdown.replace(/\[([^|]*)\|([^\]]*)\]/g, '[$1]($2)');
  
  // Clean up extra whitespace
  markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return markdown.trim();
}

/**
 * Group tickets by status
 */
function groupTicketsByStatus(tickets) {
  const grouped = {};
  
  tickets.forEach(ticket => {
    const status = ticket['Status'] || 'Unknown';
    if (!grouped[status]) {
      grouped[status] = [];
    }
    grouped[status].push(ticket);
  });
  
  // Sort statuses in a logical order
  const statusOrder = [
    'To Do',
    'Backlog',
    'Selected for Development',
    'In Progress',
    'Done',
    'Unknown'
  ];
  
  const sortedGrouped = {};
  
  // Add statuses in order
  statusOrder.forEach(status => {
    if (grouped[status]) {
      sortedGrouped[status] = grouped[status];
    }
  });
  
  // Add any remaining statuses
  Object.keys(grouped).forEach(status => {
    if (!sortedGrouped[status]) {
      sortedGrouped[status] = grouped[status];
    }
  });
  
  return sortedGrouped;
}

/**
 * Group tickets by assignee
 */
function groupTicketsByAssignee(tickets) {
  const grouped = {};
  
  tickets.forEach(ticket => {
    const assignee = ticket['Assignee'] || 'Unassigned';
    if (!grouped[assignee]) {
      grouped[assignee] = [];
    }
    grouped[assignee].push(ticket);
  });
  
  // Sort by assignee name
  const sortedGrouped = {};
  Object.keys(grouped).sort().forEach(assignee => {
    sortedGrouped[assignee] = grouped[assignee];
  });
  
  return sortedGrouped;
}

/**
 * Extract field value from potentially complex data
 */
function extractFieldValue(value, fieldName) {
  if (!value || value === 'null' || value === 'undefined') return '';
  
  // Handle [object Object] or similar
  if (value === '[object Object]') return '';
  
  // For certain fields, try to extract from JSON if it looks like JSON
  if (typeof value === 'string' && value.includes('"name"')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed.name) return parsed.name;
      if (parsed.displayName) return parsed.displayName;
    } catch (e) {
      // Not valid JSON, continue
    }
  }
  
  return value;
}

/**
 * Extract custom fields (excluding standard fields)
 */
function extractCustomFields(ticket) {
  const customFields = [];
  const excludedFields = new Set([
    'Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status',
    'Project key', 'Project name', 'Priority', 'Resolution',
    'Assignee', 'Reporter', 'Creator', 'Created', 'Updated', 'Resolved',
    'Fix versions', 'Due date', 'Labels', 'Description', 'Environment',
    'Sprint', 'Parent', 'Parent key', 'Parent summary', 'Status Category',
    'Comment', 'Assignee Id', 'Reporter Id', 'Creator Id', 'Project type',
    'Project lead', 'Project lead id', 'Project description', 'Last Viewed',
    'Votes', 'Watchers', 'Watchers Id', 'Original estimate', 'Remaining Estimate',
    'Time Spent', 'Work Ratio', 'Security Level', 'Attachment',
    // Also exclude our lowercase versions
    'summary', 'key', 'issuetype', 'status', 'priority', 'assignee',
    'reporter', 'created', 'updated', 'fixVersions', 'duedate', 'labels',
    'description', 'environment', 'sprint', 'parent', 'resolution',
    'resolutiondate', 'project', 'creator', 'aggregateprogress', 'progress',
    'votes', 'watches', 'timetracking', 'comment', 'components', 'issuelinks',
    'subtasks', 'attachment', 'versions', 'worklog', 'timeestimate',
    'timeoriginalestimate', 'timespent', 'aggregatetimeestimate',
    'aggregatetimeoriginalestimate', 'aggregatetimespent', 'workratio',
    'lastViewed', 'statusCategory', 'statuscategorychangedate', 'security'
  ]);

  Object.keys(ticket).forEach(key => {
    if (!excludedFields.has(key) && ticket[key] && String(ticket[key]).trim() !== '') {
      // Clean up custom field names
      let fieldName = key;
      if (fieldName.startsWith('Custom field (') && fieldName.endsWith(')')) {
        fieldName = fieldName.slice(14, -1); // Remove "Custom field (" and ")"
      }

      customFields.push({
        label: fieldName,
        value: ticket[key]
      });
    }
  });

  return customFields;
}

/**
 * Format a single ticket to markdown (full format same as individual reports)
 */
function formatTicketCondensed(ticket) {
  let markdown = '';
  
  // Title with issue key + summary
  const issueKey = ticket['Issue key'] || 'N/A';
  const summary = ticket['Summary'] || 'Untitled';
  markdown += `#### [${issueKey}] ${summary}\n\n`;
  
  // Key ticket information
  const keyInfo = [
    { label: 'Type', value: ticket['Issue Type'] },
    { label: 'Status', value: ticket['Status'] },
    { label: 'Priority', value: ticket['Priority'] },
    { label: 'Assignee', value: ticket['Assignee'] },
    { label: 'Reporter', value: ticket['Reporter'] },
    { label: 'Created', value: formatDate(ticket['Created']) },
    { label: 'Updated', value: formatDate(ticket['Updated']) }
  ].filter(item => item.value && item.value.trim() !== '');
  
  // Add Issue URL if host configured and issue key present
  const jiraHost = (config && config.jira && config.jira.host) ? String(config.jira.host).replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  if (jiraHost && issueKey && issueKey !== 'N/A') {
    const issueUrl = `https://${jiraHost}/browse/${issueKey}`;
    keyInfo.unshift({ label: 'Issue URL', value: `[${issueKey}](${issueUrl})` });
  }

  if (keyInfo.length > 0) {
    keyInfo.forEach(info => {
      markdown += `**${info.label}**: ${info.value}  \n`;
    });
    markdown += '\n';
  }
  
  // Description (preserve full content)
  if (ticket['Description'] && ticket['Description'].trim() !== '') {
    let description = ticket['Description'].trim();
    description = convertJiraMarkupToMarkdown(description);
    markdown += `**Description**:\n${description}\n\n`;
  }
  
  // Standard additional fields
  const standardFields = [
    { label: 'Fix Versions', value: ticket['Fix versions'] },
    { label: 'Due Date', value: formatDate(ticket['Due date']) },
    { label: 'Labels', value: ticket['Labels'] },
    { label: 'Sprint', value: ticket['Sprint'] },
    { label: 'Resolution', value: ticket['Resolution'] },
    { label: 'Environment', value: ticket['Environment'] }
  ].filter(item => item.value && item.value.trim() !== '');
  
  if (standardFields.length > 0) {
    standardFields.forEach(field => {
      markdown += `**${field.label}**: ${field.value}  \n`;
    });
    markdown += '\n';
  }
  
  // Custom fields - include all custom field data
  const customFields = extractCustomFields(ticket);
  if (customFields.length > 0) {
    markdown += `##### Custom Fields\n\n`;
    customFields.forEach(field => {
      markdown += `**${field.label}**: ${field.value}  \n`;
    });
    markdown += '\n';
  }
  
  // Comments - include all comment data
  const comments = [];
  Object.keys(ticket).forEach(key => {
    if (key.toLowerCase().includes('comment') && ticket[key] && ticket[key].trim() !== '') {
      // Try to parse comment JSON if it looks like JSON
      let commentData = ticket[key];
      if (commentData.startsWith('{')) {
        try {
          const parsed = JSON.parse(commentData);
          if (parsed.comments && Array.isArray(parsed.comments)) {
            parsed.comments.forEach(c => {
              if (c.body) {
                const author = c.author?.displayName || 'Unknown';
                const created = formatDate(c.created);
                comments.push({
                  author: author,
                  date: created,
                  body: convertJiraMarkupToMarkdown(c.body)
                });
              }
            });
          }
        } catch (e) {
          // If parsing fails, use as-is
          comments.push({ body: commentData });
        }
      } else {
        comments.push({ body: commentData });
      }
    }
  });
  
  if (comments.length > 0) {
    markdown += `##### Comments\n\n`;
    comments.forEach((comment, index) => {
      if (comment.author) {
        markdown += `**Comment ${index + 1}** by ${comment.author} on ${comment.date}:\n\n`;
      } else {
        markdown += `**Comment ${index + 1}**:\n\n`;
      }
      markdown += `${comment.body}\n\n`;
    });
  }
  
  // Parent ticket info (for sub-tasks)
  if (ticket['Parent key'] && ticket['Parent summary']) {
    if (jiraHost) {
      markdown += `**Parent**: [${ticket['Parent key']}](${`https://${jiraHost}/browse/${ticket['Parent key']}`}) ${ticket['Parent summary']}\n\n`;
    } else {
      markdown += `**Parent**: [${ticket['Parent key']}] ${ticket['Parent summary']}\n\n`;
    }
  }

  // Changelog (compact bullets from cache)
  const keyForChangelog = ticket['Issue key'] || ticket.key;
  const bullets = keyForChangelog ? getChangelogBullets(keyForChangelog) : [];
  if (bullets.length > 0) {
    markdown += `##### Changelog\n\n`;
    bullets.forEach(b => { markdown += `${b}\n`; });
    markdown += `\n`;
  }
  
  markdown += `---\n\n`;
  
  return markdown;
}

/**
 * Map field names from our export to what the format expects
 */
function mapFieldNames(ticket) {
  // Create a new object with mapped field names
  const mapped = {
    'Issue key': ticket.key,
    'Summary': ticket.summary,
    'Issue Type': extractFieldValue(ticket.issuetype, 'issuetype'),
    'Status': extractFieldValue(ticket.status, 'status'),
    'Priority': extractFieldValue(ticket.priority, 'priority'),
    'Assignee': extractFieldValue(ticket.assignee, 'assignee'),
    'Reporter': extractFieldValue(ticket.reporter, 'reporter'),
    'Created': ticket.created,
    'Updated': ticket.updated,
    'Description': ticket.description,
    'Fix versions': ticket.fixVersions,
    'Due date': ticket.duedate,
    'Labels': ticket.labels,
    'Sprint': ticket.sprint,
    'Resolution': ticket.resolution,
    'Environment': ticket.environment,
    'Parent key': '',
    'Parent summary': '',
    'Project name': extractFieldValue(ticket.project, 'project'),
    'Project key': ticket.project ? (parseComplexField(ticket.project).key || '') : ''
  };
  
  // Handle parent field if present
  if (ticket.parent) {
    const parentData = parseComplexField(ticket.parent);
    if (parentData && typeof parentData === 'object') {
      mapped['Parent key'] = parentData.key || '';
      mapped['Parent summary'] = parentData.fields?.summary || '';
    }
  }
  
  // Copy over all other fields as-is
  Object.keys(ticket).forEach(key => {
    if (!mapped.hasOwnProperty(key)) {
      mapped[key] = ticket[key];
    }
  });
  
  return mapped;
}

/**
 * Generate team report from CSV file
 */
async function generateTeamReport(csvFile, outputFile) {
  return new Promise((resolve, reject) => {
    const tickets = [];
    
    fs.createReadStream(csvFile)
      .pipe(csv())
      .on('data', (row) => {
        // Map field names to expected format
        const mappedRow = mapFieldNames(row);
        tickets.push(mappedRow);
      })
      .on('end', () => {
        if (tickets.length === 0) {
          const markdown = '# Team Report\n\nNo tickets found.\n';
          fs.writeFileSync(outputFile, markdown);
          resolve({ ticketCount: 0 });
          return;
        }
        
        // Get project info from first ticket if available
        const firstTicket = tickets[0];
        const projectName = firstTicket && firstTicket['Project name'] ? firstTicket['Project name'] : 'Unknown Project';
        const projectKey = firstTicket && firstTicket['Project key'] ? firstTicket['Project key'] : 'N/A';
        
        // Group tickets by status and assignee
        const ticketsByStatus = groupTicketsByStatus(tickets);
        const ticketsByAssignee = groupTicketsByAssignee(tickets);
        
        // Calculate statistics
        const stats = {
          total: tickets.length,
          byStatus: {},
          byAssignee: {},
          byType: {}
        };
        
        // Count by status
        Object.keys(ticketsByStatus).forEach(status => {
          stats.byStatus[status] = ticketsByStatus[status].length;
        });
        
        // Count by assignee
        Object.keys(ticketsByAssignee).forEach(assignee => {
          stats.byAssignee[assignee] = ticketsByAssignee[assignee].length;
        });
        
        // Count by type
        tickets.forEach(ticket => {
          const type = ticket['Issue Type'] || 'Unknown';
          stats.byType[type] = (stats.byType[type] || 0) + 1;
        });
        
        // Generate markdown
        let markdown = `# Team Report - ${projectName}\n\n`;
        markdown += `**Project**: ${projectName} (${projectKey})  \n`;
        markdown += `**Date Range**: ${config.jira.start_date} to ${config.jira.end_date}  \n`;
        markdown += `**Total Tickets**: ${tickets.length}  \n`;
        markdown += `**Generated**: ${new Date().toLocaleString()}\n\n`;
        
        // Executive Summary
        markdown += `## Executive Summary\n\n`;
        
        // Status summary
        markdown += `### By Status\n\n`;
        Object.entries(stats.byStatus).forEach(([status, count]) => {
          const percentage = ((count / stats.total) * 100).toFixed(1);
          markdown += `- **${status}**: ${count} tickets (${percentage}%)\n`;
        });
        markdown += '\n';
        
        // Type summary
        markdown += `### By Type\n\n`;
        Object.entries(stats.byType)
          .sort((a, b) => b[1] - a[1])
          .forEach(([type, count]) => {
            const percentage = ((count / stats.total) * 100).toFixed(1);
            markdown += `- **${type}**: ${count} tickets (${percentage}%)\n`;
          });
        markdown += '\n';
        
        // Team member summary
        markdown += `### By Team Member\n\n`;
        Object.entries(stats.byAssignee)
          .sort((a, b) => b[1] - a[1])
          .forEach(([assignee, count]) => {
            const percentage = ((count / stats.total) * 100).toFixed(1);
            markdown += `- **${assignee}**: ${count} tickets (${percentage}%)\n`;
          });
        markdown += '\n';
        
        // Detailed sections by status
        markdown += `## Tickets by Status\n\n`;
        
        Object.keys(ticketsByStatus).forEach(status => {
          const statusTickets = ticketsByStatus[status];
          markdown += `### ${status} (${statusTickets.length})\n\n`;
          
          // Group by assignee within status
          const byAssignee = {};
          statusTickets.forEach(ticket => {
            const assignee = ticket['Assignee'] || 'Unassigned';
            if (!byAssignee[assignee]) {
              byAssignee[assignee] = [];
            }
            byAssignee[assignee].push(ticket);
          });
          
          // Display tickets grouped by assignee
          Object.keys(byAssignee).sort().forEach(assignee => {
            markdown += `**${assignee}** (${byAssignee[assignee].length} tickets)\n\n`;
            byAssignee[assignee].forEach(ticket => {
              markdown += formatTicketCondensed(ticket);
            });
          });
        });
        
        // Team member details
        markdown += `## Team Member Details\n\n`;
        
        Object.keys(ticketsByAssignee).sort().forEach(assignee => {
          const assigneeTickets = ticketsByAssignee[assignee];
          markdown += `### ${assignee} (${assigneeTickets.length} tickets)\n\n`;
          
          // Count by status for this assignee
          const statusCount = {};
          assigneeTickets.forEach(ticket => {
            const status = ticket['Status'] || 'Unknown';
            statusCount[status] = (statusCount[status] || 0) + 1;
          });
          
          // Show status breakdown
          Object.entries(statusCount).forEach(([status, count]) => {
            markdown += `- ${status}: ${count}\n`;
          });
          markdown += '\n';
        });
        
        // Footer
        markdown += `\n---\n\n`;
        markdown += `*Team report generated from Jira export on ${new Date().toLocaleString()}*\n`;
        
        fs.writeFileSync(outputFile, markdown);
        resolve({ ticketCount: tickets.length });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Main function
 */
async function main() {
  const dataDir = path.join(__dirname, 'data');
  const outputDir = path.join(__dirname, 'md_output');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Find the main CSV export file
  const files = fs.readdirSync(dataDir).filter(file => 
    file.endsWith('_export.csv') && !file.includes('by-assignee')
  );
  
  if (files.length === 0) {
    console.error('No export CSV file found in jira/data/');
    console.error('Please run jira:export first to generate the CSV file.');
    process.exit(1);
  }
  
  const csvFile = files[0];
  const inputPath = path.join(dataDir, csvFile);
  const outputFileName = `${config.jira.project}_${config.jira.start_date}_to_${config.jira.end_date}_team_report.md`;
  const outputPath = path.join(outputDir, outputFileName);
  
  console.log(`Generating team report from: ${csvFile}`);
  console.log(`Output file: ${outputFileName}`);
  
  try {
    const result = await generateTeamReport(inputPath, outputPath);
    console.log(`\n✓ Team report generated successfully!`);
    console.log(`  Total tickets: ${result.ticketCount}`);
    console.log(`  Output: ${path.relative(process.cwd(), outputPath)}`);
  } catch (error) {
    console.error('Failed to generate team report:', error);
    process.exit(1);
  }
}

// Run the script
main();
