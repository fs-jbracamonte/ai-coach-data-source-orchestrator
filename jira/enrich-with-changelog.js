const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { handleError } = require('../lib/error-handler');
const { JiraAPIError, FileSystemError } = require('../lib/errors');
const { fetchChangelogs } = require('./lib/changelog-client');
const { flattenChangelogs } = require('./lib/changelog-flatten');

const CACHE_DIR = path.join(__dirname, 'data', 'changelogs');
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) {
    handleError(new FileSystemError(`Failed to create cache directory: ${CACHE_DIR}`, { operation: 'mkdir', dir: CACHE_DIR }), { module: 'jira', operation: 'enrich-with-changelog' }, { exit: false });
  }
}

function readCache(issueKey) {
  try {
    const p = path.join(CACHE_DIR, `${issueKey}.json`);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    const age = Date.now() - stat.mtimeMs;
    if (age > TTL_MS) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeCache(issueKey, data) {
  try {
    const p = path.join(CACHE_DIR, `${issueKey}.json`);
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  } catch (e) {
    handleError(new FileSystemError(`Failed to write cache for ${issueKey}`, { operation: 'write', path: 'jira/data/changelogs' }), { module: 'jira', operation: 'enrich-with-changelog' }, { exit: false });
  }
}

/**
 * Enrich an array of issue objects with a compact changelog under `issue.changelogLite`.
 * Issues are expected to have `key`.
 *
 * @param {Array<{ key: string }>} issues
 * @returns {Promise<Array>}
 */
async function enrichWithChangelog(issues) {
  ensureCacheDir();
  if (!Array.isArray(issues) || issues.length === 0) return issues || [];

  const uniqueKeys = Array.from(new Set(issues.map(i => i.key).filter(Boolean)));

  // Determine which require network
  const toFetch = [];
  const cachedMap = new Map();
  for (const k of uniqueKeys) {
    const cached = readCache(k);
    if (cached && Array.isArray(cached)) {
      cachedMap.set(k, cached);
    } else {
      toFetch.push(k);
    }
  }

  // Fetch with small concurrency, handle errors per-issue
  let fetched = new Map();
  if (toFetch.length > 0) {
    try {
      fetched = await fetchChangelogs(toFetch, {
        concurrency: 5,
        onError: (key, error) => {
          handleError(error instanceof Error ? error : new JiraAPIError(String(error)), {
            module: 'jira',
            operation: 'fetch-changelog',
            configFile: process.env.CONFIG_FILE || 'config.json'
          }, { exit: false });
        },
        onProgress: ({ completed, total, key }) => {
          if (completed === 1 || completed % 10 === 0 || completed === total) {
            console.log(`[changelog] Fetched ${completed}/${total}${key ? ` (last: ${key})` : ''}`);
          }
        }
      });
    } catch (e) {
      // Global failure should not abort; proceed with what we have
      handleError(e, { module: 'jira', operation: 'fetch-changelogs' }, { exit: false });
    }
  }

  // Flatten and cache fetched
  for (const key of toFetch) {
    const histories = fetched.get(key) || [];
    try {
      writeCache(key, histories);
    } catch (_) {}
  }

  // Combine cached + fetched and flatten
  const keyToLite = new Map();
  for (const key of uniqueKeys) {
    const histories = cachedMap.get(key) || fetched.get(key) || [];
    let lite = [];
    try {
      lite = flattenChangelogs(histories);
    } catch (e) {
      handleError(e, { module: 'jira', operation: 'flatten-changelog' }, { exit: false });
      lite = [];
    }
    keyToLite.set(key, lite);
  }

  // Attach to issues
  for (const issue of issues) {
    const lite = keyToLite.get(issue.key) || [];
    issue.changelogLite = lite;
  }
  return issues;
}

module.exports = enrichWithChangelog;


