const https = require('https');
require('dotenv').config();

const configModule = require('../../lib/config');
const { JiraAPIError, ConfigurationError } = require('../../lib/errors');
const { handleError } = require('../../lib/error-handler');

// Resolve config lazily to support both legacy and hierarchical loaders
function getConfig() {
  try {
    // Prefer hierarchical when TEAM and REPORT_TYPE are set
    if (process.env.TEAM && process.env.REPORT_TYPE) {
      return configModule.ConfigManager.loadForReportType(process.env.TEAM, process.env.REPORT_TYPE);
    }
    return configModule.load();
  } catch (error) {
    // Surface configuration errors immediately for callers
    handleError(error, { module: 'jira', operation: 'changelog-client:init', configFile: process.env.CONFIG_FILE || 'config.json' });
    throw error;
  }
}

function ensureJiraEnvAndHost() {
  const config = getConfig();
  if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    throw new ConfigurationError('Missing required Jira credentials in .env', {
      missing: ['JIRA_EMAIL', 'JIRA_API_TOKEN'].filter(v => !process.env[v])
    });
  }
  if (!config?.jira?.host) {
    throw new ConfigurationError('No Jira host specified in configuration (jira.host)', { field: 'jira.host' });
  }
  return config;
}

function getJiraHost() {
  const config = getConfig();
  return String(config.jira.host).replace('https://', '').replace('http://', '').replace(/\/$/, '');
}

class ChangelogClient {
  /**
   * @param {Object} opts
   * @param {(options: object, onResponse: function)=>{end:Function, on:Function, write?:Function}} [opts.httpRequestImpl]
   * @param {number} [opts.maxRetries]
   * @param {number[]} [opts.retryDelaysMs]
   */
  constructor(opts = {}) {
    this._request = opts.httpRequestImpl || https.request;
    this._maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 3;
    this._retryDelays = Array.isArray(opts.retryDelaysMs) && opts.retryDelaysMs.length > 0
      ? opts.retryDelaysMs
      : [1000, 2000, 4000];
  }

  _makeGet(pathname, attempt = 0) {
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const jiraHost = getJiraHost();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: jiraHost,
        path: pathname,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      const req = this._request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const status = res.statusCode || 0;
          if (status === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new JiraAPIError(`Failed to parse Jira response JSON: ${e.message}`, { host: options.hostname, path: options.path }));
            }
            return;
          }

          // Non-fatal statuses: return empty result shape
          if (status === 401 || status === 403 || status === 404) {
            resolve({ startAt: 0, maxResults: 0, total: 0, values: [] });
            return;
          }

          if (status === 429 && attempt < this._retryDelays.length) {
            const delay = this._retryDelays[attempt];
            setTimeout(() => {
              this._makeGet(pathname, attempt + 1).then(resolve).catch(reject);
            }, delay);
            return;
          }

          reject(new JiraAPIError(`HTTP ${status}: ${res.statusMessage}`, {
            statusCode: status,
            host: options.hostname,
            path: options.path,
            response: data.substring(0, 500)
          }));
        });
      });

      req.on('error', (error) => {
        reject(new JiraAPIError(`Network error: ${error.message}`, {
          host: jiraHost,
          path: pathname,
          originalError: error.message
        }));
      });
      req.end();
    });
  }

  /**
   * Fetch full changelog histories for a single issue key, handling pagination and retries.
   * @param {string} issueKey
   * @returns {Promise<Array>} Array of changelog history objects
   */
  async fetchChangelog(issueKey) {
    ensureJiraEnvAndHost();
    const encoded = encodeURIComponent(issueKey);
    let startAt = 0;
    const maxResults = 100;
    const histories = [];

    // Continue until we gather all pages
    while (true) {
      const p = `/rest/api/3/issue/${encoded}/changelog?startAt=${startAt}&maxResults=${maxResults}`;
      let page;
      try {
        page = await this._makeGet(p);
      } catch (err) {
        // Let caller decide how to handle; but normalize 401/403/404 to empty is already done above
        throw err;
      }
      const values = Array.isArray(page.values) ? page.values : [];
      histories.push(...values);

      const next = startAt + values.length;
      const total = typeof page.total === 'number' ? page.total : next;
      if (next >= total || values.length === 0) break;
      startAt = next;
    }
    return histories;
  }

  /**
   * Fetch changelogs for multiple issue keys with a small concurrency pool.
   * @param {string[]} issueKeys
   * @param {{concurrency?: number, onError?: (key: string, error: Error)=>void}} [options]
   * @returns {Promise<Map<string, Array>>}
   */
  async fetchChangelogs(issueKeys, options = {}) {
    const concurrency = Math.max(1, Math.min(20, options.concurrency || 5));
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const results = new Map();

    const queue = Array.from(new Set(issueKeys));
    let inFlight = 0;
    let completed = 0;
    let resolveAll;
    const donePromise = new Promise(r => resolveAll = r);

    const maybeDequeue = () => {
      if (queue.length === 0 && inFlight === 0) {
        resolveAll();
        return;
      }
      while (inFlight < concurrency && queue.length > 0) {
        const key = queue.shift();
        inFlight++;
        this.fetchChangelog(key)
          .then(histories => {
            results.set(key, histories);
          })
          .catch(err => {
            // Non-fatal: log and continue
            onError(key, err);
            results.set(key, []);
          })
          .finally(() => {
            inFlight--;
            completed++;
            if (onProgress) {
              try { onProgress({ completed, total: queue.length + inFlight + completed, key }); } catch (_) {}
            }
            maybeDequeue();
          });
      }
    };

    maybeDequeue();
    await donePromise;
    return results;
  }
}

// Default singleton client
const defaultClient = new ChangelogClient();

module.exports = {
  ChangelogClient,
  createClient: (opts) => new ChangelogClient(opts || {}),
  fetchChangelog: (issueKey) => defaultClient.fetchChangelog(issueKey),
  fetchChangelogs: (issueKeys, options) => defaultClient.fetchChangelogs(issueKeys, options || {})
};


