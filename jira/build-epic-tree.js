const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const configModule = require('../lib/config');
const { JiraAPIError, ConfigurationError, FileSystemError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');

const csv = require('csv-parser');

// Load config (hierarchical when TEAM and REPORT_TYPE are set; fallback to legacy)
let config;
const { getProjectFolder } = require('../lib/project-folder');
try {
  config = configModule.load();
} catch (error) {
  handleError(error, { module: 'jira', operation: 'build-epic-tree', configFile: process.env.CONFIG_FILE || 'config.json' });
  process.exit(1);
}

// --- Helpers: Validation & Formatting ---
function ensureJiraEnv() {
  if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    throw new ConfigurationError('Missing required Jira credentials in .env', {
      missing: ['JIRA_EMAIL', 'JIRA_API_TOKEN'].filter(v => !process.env[v]),
      resolutionSteps: [
        'Set JIRA_EMAIL in your .env file',
        'Set JIRA_API_TOKEN in your .env file',
        'Generate an API token at: https://id.atlassian.com/manage-profile/security/api-tokens',
        'Copy example.env to .env if you haven\'t already'
      ]
    });
  }
  if (!config?.jira?.host) {
    throw new ConfigurationError('No Jira host specified in configuration (jira.host)', {
      field: 'jira.host',
      resolutionSteps: [
        'Add a "host" field under "jira" in your config file',
        'Use domain only (e.g., "company.atlassian.net")',
        'Do not include protocol (http:// or https://)'
      ]
    });
  }
  if (!config?.jira?.project) {
    throw new ConfigurationError('No Jira project specified in configuration (jira.project)', {
      field: 'jira.project',
      resolutionSteps: [
        'Add a "project" field under "jira" in your config file',
        'Use the project key (e.g., "AICD", "PROJ")'
      ]
    });
  }
  if (!config?.jira?.start_date || !config?.jira?.end_date) {
    throw new ConfigurationError('jira.start_date and jira.end_date are required', {
      field: 'jira.start_date/end_date'
    });
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return iso; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new FileSystemError(`Failed to create directory: ${dir}`, { operation: 'mkdir', dir });
    }
  }
}

// --- Jira HTTP Helpers ---
function getJiraHost() {
  return String(config.jira.host).replace('https://', '').replace('http://', '').replace(/\/$/, '');
}

function makeJiraGetRequest(requestPath, attempt = 0) {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  const jiraHost = getJiraHost();
  const delays = [1000, 2000, 4000];

  return new Promise((resolve, reject) => {
    const options = {
      hostname: jiraHost,
      path: requestPath,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new JiraAPIError(`Failed to parse Jira response JSON: ${e.message}`, { host: options.hostname, path: options.path }));
          }
        } else if (res.statusCode === 429 && attempt < delays.length) {
          const delay = delays[attempt];
          setTimeout(() => {
            makeJiraGetRequest(requestPath, attempt + 1).then(resolve).catch(reject);
          }, delay);
        } else {
          reject(new JiraAPIError(`HTTP ${res.statusCode}: ${res.statusMessage}`, {
            statusCode: res.statusCode,
            host: options.hostname,
            path: options.path,
            response: data.substring(0, 500)
          }));
        }
      });
    });
    req.on('error', (error) => {
      reject(new JiraAPIError(`Network error: ${error.message}`, {
        host: jiraHost,
        path: requestPath,
        originalError: error.message
      }));
    });
    req.end();
  });
}

function makeJiraPostRequest(requestPath, body, attempt = 0) {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  const jiraHost = getJiraHost();
  const delays = [1000, 2000, 4000];
  const postData = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: jiraHost,
      path: requestPath,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new JiraAPIError(`Failed to parse Jira response JSON: ${e.message}`, { host: options.hostname, path: options.path }));
          }
        } else if (res.statusCode === 429 && attempt < delays.length) {
          const delay = delays[attempt];
          setTimeout(() => {
            makeJiraPostRequest(requestPath, body, attempt + 1).then(resolve).catch(reject);
          }, delay);
        } else {
          reject(new JiraAPIError(`HTTP ${res.statusCode}: ${res.statusMessage}`, {
            statusCode: res.statusCode,
            host: options.hostname,
            path: options.path,
            response: data.substring(0, 500)
          }));
        }
      });
    });
    req.on('error', (error) => {
      reject(new JiraAPIError(`Network error: ${error.message}`, {
        host: jiraHost,
        path: requestPath,
        originalError: error.message
      }));
    });
    req.write(postData);
    req.end();
  });
}

// --- CSV seeds ---
async function ensureExportAndGetCsvPath() {
  const PROJECT_FOLDER = getProjectFolder(process.env.TEAM, config);
  const dataDir = path.join(__dirname, 'data', PROJECT_FOLDER);
  ensureDir(dataDir);
  const expected = `${config.jira.project}_${config.jira.start_date}_to_${config.jira.end_date}_export.csv`;
  const fullPath = path.join(dataDir, expected);

  if (!fs.existsSync(fullPath)) {
    console.log(`[epic-tree] Export CSV not found (${expected}); running Jira export...`);
    try {
      const exportJiraData = require('./export-to-csv');
      await exportJiraData();
    } catch (e) {
      throw e;
    }
  }

  if (!fs.existsSync(fullPath)) {
    throw new FileSystemError(`Expected export CSV not found after export: ${fullPath}`, { operation: 'read', path: fullPath });
  }
  return fullPath;
}

async function readSeedIssueKeys(csvFile) {
  return new Promise((resolve, reject) => {
    const keys = new Set();
    try {
      fs.createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          const k = row.key || row['key'] || row['Issue key'] || row['Issue Key'];
          if (k) keys.add(String(k).trim());
        })
        .on('end', () => resolve(Array.from(keys)))
        .on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// --- Epic resolution ---
async function getIssueBasic(key) {
  const fields = 'issuetype,parent';
  const p = `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`;
  return await makeJiraGetRequest(p);
}

async function getIssueDetails(key) {
  const fields = '*all';
  const p = `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`;
  return await makeJiraGetRequest(p);
}

function isEpic(issue) {
  return issue?.fields?.issuetype?.name?.toLowerCase() === 'epic';
}

async function resolveEpicKeyForSeed(seedKey) {
  try {
    const issue = await getIssueBasic(seedKey);
    if (isEpic(issue)) return seedKey;

    const parent = issue?.fields?.parent;
    const parentIssueTypeName = parent?.fields?.issuetype?.name;
    if (parent && parentIssueTypeName && parentIssueTypeName.toLowerCase() === 'epic') {
      return parent.key;
    }

    const isSubtask = issue?.fields?.issuetype?.subtask === true;
    if (isSubtask && parent?.key) {
      // Fetch parent to see if its parent is an epic
      const parentIssue = await getIssueBasic(parent.key);
      const pp = parentIssue?.fields?.parent;
      const ppTypeName = pp?.fields?.issuetype?.name;
      if (pp && ppTypeName && ppTypeName.toLowerCase() === 'epic') {
        return pp.key;
      }
    }
  } catch (e) {
    // Skip problematic seeds but log
    console.warn(`[epic-tree] Failed to resolve epic for seed ${seedKey}: ${e.message}`);
  }
  return null;
}

// --- Children & subtasks ---
async function fetchEpicChildren(epicKey) {
  const fields = ['*all'];
  let nextPageToken = null;
  const all = [];
  do {
    const body = {
      jql: `parent = ${epicKey}`,
      maxResults: 50,
      fields: fields,
      ...(nextPageToken ? { nextPageToken } : {})
    };
    const data = await makeJiraPostRequest('/rest/api/3/search/jql', body);
    if (Array.isArray(data.issues)) all.push(...data.issues);
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);
  return all;
}

async function fetchSubtasksForParents(parentKeys) {
  if (!parentKeys || parentKeys.length === 0) return [];
  const fields = ['*all'];
  const batches = [];
  const chunkSize = 40; // keep query length reasonable
  for (let i = 0; i < parentKeys.length; i += chunkSize) {
    batches.push(parentKeys.slice(i, i + chunkSize));
  }
  const results = [];
  for (const batch of batches) {
    const jql = `parent in (${batch.map(k => k).join(', ')})`;
    let nextPageToken = null;
    do {
      const body = {
        jql,
        maxResults: 50,
        fields,
        ...(nextPageToken ? { nextPageToken } : {})
      };
      const data = await makeJiraPostRequest('/rest/api/3/search/jql', body);
      if (Array.isArray(data.issues)) results.push(...data.issues);
      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken);
  }
  return results;
}

// --- Markdown formatting ---
function asText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => v.name || v.value || v).join(', ');
  if (typeof value === 'object') {
    if (value.displayName) return value.displayName;
    if (value.name) return value.name;
    if (value.key) return value.key;
  }
  return String(value);
}

// Convert Jira wiki-ish markup to Markdown (best-effort)
function convertJiraMarkupToMarkdown(text) {
  if (!text) return '';
  let markdown = String(text);
  markdown = markdown.replace(/\{color:[^}]*\}(.*?)\{color\}/g, '$1');
  markdown = markdown.replace(/^h([1-6])\.\s+(.*)$/gm, (match, level, content) => {
    return '#'.repeat(parseInt(level)) + ' ' + content;
  });
  markdown = markdown.replace(/\*([^*]+)\*/g, '**$1**');
  markdown = markdown.replace(/^#\s+(.*)$/gm, '1. $1');
  markdown = markdown.replace(/^\*\s+(.*)$/gm, '- $1');
  markdown = markdown.replace(/\[([^|]*)\|([^\]]*)\]/g, '[$1]($2)');
  markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n');
  return markdown.trim();
}

// Minimal ADF (Atlassian Document Format) to plain text
function adfToPlainText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToPlainText).join('');
  const type = node.type;
  const text = node.text || '';
  const content = node.content || [];
  switch (type) {
    case 'text':
      return text;
    case 'paragraph':
      return content.map(adfToPlainText).join('') + '\n\n';
    case 'heading':
      return content.map(adfToPlainText).join('') + '\n\n';
    case 'bulletList':
    case 'orderedList':
      return content.map(adfToPlainText).join('') + '\n';
    case 'listItem':
      return '- ' + content.map(adfToPlainText).join('') + '\n';
    case 'mention':
      return '@' + (node.attrs && node.attrs.text ? node.attrs.text : 'user');
    case 'hardBreak':
      return '\n';
    default:
      return content.map(adfToPlainText).join('');
  }
}

function normalizeDescriptionToMarkdown(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return convertJiraMarkupToMarkdown(desc);
  if (desc && typeof desc === 'object') {
    // Likely ADF
    try {
      const plain = adfToPlainText(desc).trim();
      return plain;
    } catch (_) {
      return String(desc);
    }
  }
  return String(desc);
}

function ticketHeaderLine(issue) {
  const key = issue.key;
  const summary = issue.fields?.summary || 'Untitled';
  return `#### [${key}] ${summary}`;
}

function formatKeyInfoLines(issue) {
  const f = issue.fields || {};
  const info = [
    { label: 'Type', value: f.issuetype?.name },
    { label: 'Status', value: f.status?.name },
    { label: 'Priority', value: f.priority?.name },
    { label: 'Assignee', value: f.assignee?.displayName },
    { label: 'Reporter', value: f.reporter?.displayName },
    { label: 'Created', value: formatDate(f.created) },
    { label: 'Updated', value: formatDate(f.updated) }
  ].filter(i => i.value);
  return info.map(i => `**${i.label}**: ${asText(i.value)}  `).join('\n');
}

function formatStandardFields(issue) {
  const f = issue.fields || {};
  const fields = [
    { label: 'Fix Versions', value: (f.fixVersions || []).map(v => v.name).join(', ') },
    { label: 'Due Date', value: formatDate(f.duedate) },
    { label: 'Labels', value: (f.labels || []).join(', ') },
    { label: 'Sprint', value: Array.isArray(f.sprint) ? f.sprint.map(s => s.name).join(', ') : (f.sprint?.name || '') }
  ].filter(i => i.value);
  return fields.map(i => `**${i.label}**: ${asText(i.value)}  `).join('\n');
}

function extractCustomFieldsFromIssue(issue) {
  const f = issue.fields || {};
  const excluded = new Set([
    'summary','issuetype','status','priority','assignee','reporter','created','updated','labels','sprint','fixVersions','duedate','description','parent','project','resolution','environment','components','issuelinks','subtasks','attachment','versions','worklog','timetracking','comment','creator','lastViewed','statuscategorychangedate','security','aggregateprogress','progress','votes','watches','timeestimate','timeoriginalestimate','timespent','aggregatetimeestimate','aggregatetimeoriginalestimate','aggregatetimespent','resolutiondate','workratio'
  ]);
  const custom = [];
  Object.keys(f).forEach(k => {
    if (excluded.has(k)) return;
    if (f[k] === null || f[k] === undefined) return;
    const v = f[k];
    // Ignore empty arrays/objects
    if (Array.isArray(v) && v.length === 0) return;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return;
    // Presentable name
    const label = k.startsWith('customfield_') ? k : k;
    let valueStr = '';
    if (typeof v === 'string') valueStr = v;
    else if (Array.isArray(v)) valueStr = v.map(x => x && (x.name || x.value || x.displayName || x.key || String(x))).join(', ');
    else if (typeof v === 'object') valueStr = v.name || v.value || v.displayName || v.key || JSON.stringify(v);
    else valueStr = String(v);
    if (String(valueStr).trim() !== '') {
      custom.push({ label, value: valueStr });
    }
  });
  return custom;
}

async function fetchAllComments(issueKey) {
  const all = [];
  let startAt = 0;
  const maxResults = 100;
  while (true) {
    const p = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${maxResults}`;
    const page = await makeJiraGetRequest(p);
    const comments = Array.isArray(page.comments) ? page.comments : [];
    all.push(...comments);
    const next = startAt + comments.length;
    if (next >= (page.total || comments.length)) break;
    startAt = next;
  }
  return all;
}

function formatCommentsSection(comments) {
  if (!comments || comments.length === 0) return '';
  let md = '##### Comments\n\n';
  comments.forEach((c, idx) => {
    const author = c.author?.displayName || 'Unknown';
    const created = formatDate(c.created);
    let body = '';
    if (typeof c.body === 'string') body = convertJiraMarkupToMarkdown(c.body);
    else if (c.body && typeof c.body === 'object') body = adfToPlainText(c.body).trim();
    else body = String(c.body || '');
    md += `**Comment ${idx + 1}** by ${author} on ${created}:\n\n`;
    md += `${body}\n\n`;
  });
  return md;
}

function formatIssueFull(issue, comments) {
  let md = '';
  md += `${ticketHeaderLine(issue)}\n\n`;
  const k1 = formatKeyInfoLines(issue);
  if (k1) md += k1 + '\n\n';
  const f = issue.fields || {};
  const desc = normalizeDescriptionToMarkdown(f.description);
  if (desc && desc.trim() !== '') {
    md += `**Description**:\n${desc}\n\n`;
  }
  const k2 = formatStandardFields(issue);
  if (k2) md += k2 + '\n\n';
  const custom = extractCustomFieldsFromIssue(issue);
  if (custom.length > 0) {
    md += '##### Custom Fields\n\n';
    custom.forEach(cf => { md += `**${cf.label}**: ${cf.value}  \n`; });
    md += '\n';
  }
  const commentsMd = formatCommentsSection(comments);
  if (commentsMd) md += commentsMd;
  // Parent info
  if (f.parent?.key && f.parent?.fields?.summary) {
    md += `**Parent**: [${f.parent.key}] ${f.parent.fields.summary}\n\n`;
  }
  md += `---\n\n`;
  return md;
}

function formatEpicSection(epicIssue, children, subtasksByParent) {
  const ef = epicIssue.fields || {};
  let md = '';
  md += `## [${epicIssue.key}] ${ef.summary || 'Untitled Epic'}\n\n`;
  const epicDetails = [
    { label: 'Status', value: ef.status?.name },
    { label: 'Assignee', value: ef.assignee?.displayName },
    { label: 'Reporter', value: ef.reporter?.displayName },
    { label: 'Created', value: formatDate(ef.created) },
    { label: 'Updated', value: formatDate(ef.updated) },
    { label: 'Labels', value: (ef.labels || []).join(', ') }
  ].filter(i => i.value);
  if (epicDetails.length) {
    epicDetails.forEach(i => { md += `**${i.label}**: ${asText(i.value)}  \n`; });
    md += '\n';
  }
  md += `### Children\n\n`;
  for (const child of children) {
    const childComments = child._epicTreeComments || [];
    md += formatIssueFull(child, childComments);
    const childKey = child.key;
    const subs = subtasksByParent.get(childKey) || [];
    if (subs.length > 0) {
      md += `#### Subtasks\n\n`;
      for (const st of subs) {
        const stComments = st._epicTreeComments || [];
        md += formatIssueFull(st, stComments);
      }
    }
  }
  return md;
}

// --- Main ---
async function main() {
  ensureJiraEnv();

  console.log(`[epic-tree] Building Epic Tree for project=${config.jira.project} range=${config.jira.start_date}..${config.jira.end_date}`);

  // Ensure CSV export exists and read seeds
  const csvPath = await ensureExportAndGetCsvPath();
  console.log(`[epic-tree] Reading seed issue keys from: ${csvPath}`);
  const seedKeys = await readSeedIssueKeys(csvPath);
  if (seedKeys.length === 0) {
    console.warn('[epic-tree] No seed issues found in export CSV (comment-date filtered).');
  }

  // Resolve epics
  const epicKeySet = new Set();
  const noEpicSeeds = new Set();
  let resolvedCount = 0;
  for (const seed of seedKeys) {
    const epic = await resolveEpicKeyForSeed(seed);
    if (epic) epicKeySet.add(epic);
    else noEpicSeeds.add(seed);
    resolvedCount++;
    if (resolvedCount === 1 || resolvedCount % 20 === 0 || resolvedCount === seedKeys.length) {
      console.log(`[epic-tree] Resolved epics for ${resolvedCount}/${seedKeys.length} seeds...`);
    }
  }
  const epicKeys = Array.from(epicKeySet);
  console.log(`[epic-tree] Resolved ${epicKeys.length} epic(s).`);

  // Prepare output
  const PROJECT_FOLDER = getProjectFolder(process.env.TEAM, config);
  const outputDir = path.join(__dirname, 'md_output', PROJECT_FOLDER);
  ensureDir(outputDir);
  const outName = `epic_tree_${config.jira.project}_${config.jira.start_date}_to_${config.jira.end_date}.md`;
  const outPath = path.join(outputDir, outName);

  let md = `# Epic Tree - ${config.jira.project}\n\n`;
  md += `**Project**: ${config.jira.project}  \n`;
  md += `**Date Range**: ${config.jira.start_date} to ${config.jira.end_date}  \n`;
  md += `**Generated**: ${new Date().toLocaleString()}\n\n`;

  if (epicKeys.length === 0) {
    md += '_No epics resolved from seed issues in the configured date range._\n';
    fs.writeFileSync(outPath, md);
    console.log(`\n✓ Epic tree generated (empty) at: ${outPath}`);
    return;
  }

  // For each epic: fetch epic details, children, and subtasks
  let epicIndex = 0;
  for (const epicKey of epicKeys) {
    epicIndex++;
    console.log(`[epic-tree] Processing epic ${epicIndex}/${epicKeys.length}: ${epicKey}`);
    let epicIssue;
    try {
      epicIssue = await getIssueDetails(epicKey);
    } catch (e) {
      console.warn(`[epic-tree] Failed to fetch epic details for ${epicKey}: ${e.message}`);
      continue;
    }

    let children = [];
    try {
      children = await fetchEpicChildren(epicKey);
      console.log(`[epic-tree] -> Fetched ${children.length} child issue(s) for ${epicKey}`);
    } catch (e) {
      console.warn(`[epic-tree] Failed to fetch children for ${epicKey}: ${e.message}`);
    }

    // Fetch comments for children
    let childIdx = 0;
    for (const child of children) {
      childIdx++;
      try {
        child._epicTreeComments = await fetchAllComments(child.key);
        if (childIdx % 10 === 0 || childIdx === children.length) {
          console.log(`[epic-tree] -> Comments fetched for ${childIdx}/${children.length} children...`);
        }
      } catch (e) {
        child._epicTreeComments = [];
      }
    }

    let subtasks = [];
    try {
      const childKeys = children.map(c => c.key);
      subtasks = await fetchSubtasksForParents(childKeys);
      console.log(`[epic-tree] -> Fetched ${subtasks.length} subtasks across ${childKeys.length} children`);
    } catch (e) {
      console.warn(`[epic-tree] Failed to fetch subtasks for epic ${epicKey}: ${e.message}`);
    }

    const subtasksByParent = new Map();
    for (const st of subtasks) {
      const parentKey = st?.fields?.parent?.key;
      if (!parentKey) continue;
      if (!subtasksByParent.has(parentKey)) subtasksByParent.set(parentKey, []);
      // Deduplicate by key
      const list = subtasksByParent.get(parentKey);
      if (!list.find(x => x.key === st.key)) list.push(st);
    }

    // Fetch comments for subtasks
    for (const [pKey, list] of subtasksByParent.entries()) {
      let stIdx = 0;
      for (const st of list) {
        stIdx++;
        try {
          st._epicTreeComments = await fetchAllComments(st.key);
        } catch (e) {
          st._epicTreeComments = [];
        }
        if (stIdx % 20 === 0 || stIdx === list.length) {
          console.log(`[epic-tree] -> Comments fetched for ${stIdx}/${list.length} subtasks under ${pKey}`);
        }
      }
    }

    md += formatEpicSection(epicIssue, children, subtasksByParent);
  }

  // Include non-epic seeds so no filtered ticket is dropped
  if (noEpicSeeds.size > 0) {
    md += `## Issues Without Epic\n\n`;
    for (const key of noEpicSeeds) {
      try {
        const issue = await getIssueDetails(key);
        const comments = await fetchAllComments(key);
        md += formatIssueFull(issue, comments);
      } catch (e) {
        console.warn(`[epic-tree] Failed to include non-epic issue ${key}: ${e.message}`);
      }
    }
  }

  fs.writeFileSync(outPath, md);
  console.log(`\n✓ Epic tree generated at: ${outPath}`);
}

// Execute
main().catch(err => {
  handleError(err, {
    module: 'jira',
    operation: 'build-epic-tree',
    configFile: process.env.CONFIG_FILE || 'config.json'
  });
});



