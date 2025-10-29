const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const configModule = require('../../lib/config');
const { getProjectFolder } = require('../../lib/project-folder');
const { JiraAPIError, ConfigurationError } = require('../../lib/errors');
const { handleError } = require('../../lib/error-handler');

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve config lazily to support both legacy and hierarchical loaders
 */
function getConfig() {
  try {
    if (process.env.TEAM && process.env.REPORT_TYPE) {
      return configModule.ConfigManager.loadForReportType(process.env.TEAM, process.env.REPORT_TYPE);
    }
    return configModule.load();
  } catch (error) {
    handleError(error, { module: 'jira', operation: 'field-map:init', configFile: process.env.CONFIG_FILE || 'config.json' });
    throw error;
  }
}

/**
 * Get Jira host from config
 */
function getJiraHost() {
  const config = getConfig();
  if (!config?.jira?.host) {
    throw new ConfigurationError('No Jira host specified in configuration (jira.host)', { field: 'jira.host' });
  }
  return String(config.jira.host).replace('https://', '').replace('http://', '').replace(/\/$/, '');
}

/**
 * Get cache file path for the current project
 * Stores in configs/<team>/ to avoid accidental deletion by clean scripts
 */
function getCachePath() {
  const config = getConfig();
  const team = process.env.TEAM;
  
  if (!team) {
    throw new ConfigurationError('TEAM environment variable is required for field map caching', {
      field: 'TEAM',
      resolutionSteps: [
        'Set TEAM environment variable (e.g., TEAM=engagepath)',
        'Or use a team-specific npm script (e.g., npm run engagepath:jira-team)'
      ]
    });
  }
  
  const configDir = path.join(__dirname, '..', '..', 'configs', team);
  
  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  return path.join(configDir, 'field-map.json');
}

/**
 * Read cached field map if valid
 */
function readCache(cachePath, ttlMs) {
  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - (data.timestamp || 0);
    
    if (age > ttlMs) {
      return null; // Expired
    }
    
    return data.fieldMap || {};
  } catch (error) {
    // Invalid cache file, ignore
    return null;
  }
}

/**
 * Write field map to cache
 */
function writeCache(cachePath, fieldMap) {
  try {
    const data = {
      timestamp: Date.now(),
      fieldMap: fieldMap
    };
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    // Non-fatal: log but continue
    console.warn(`[field-map] Failed to write cache: ${error.message}`);
  }
}

/**
 * Fetch field metadata from Jira API
 */
function fetchFieldsFromApi() {
  return new Promise((resolve, reject) => {
    // Check credentials
    if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
      reject(new ConfigurationError('Missing required Jira credentials in .env', {
        missing: ['JIRA_EMAIL', 'JIRA_API_TOKEN'].filter(v => !process.env[v])
      }));
      return;
    }

    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const jiraHost = getJiraHost();
    const requestPath = '/rest/api/3/field';

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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const fields = JSON.parse(data);
            
            // Build map: { id: name }
            const fieldMap = {};
            if (Array.isArray(fields)) {
              fields.forEach(field => {
                if (field.id && field.name) {
                  fieldMap[field.id] = field.name;
                }
              });
            }
            
            resolve(fieldMap);
          } catch (e) {
            reject(new JiraAPIError(`Failed to parse Jira fields response: ${e.message}`, {
              host: options.hostname,
              path: options.path
            }));
          }
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
      reject(new JiraAPIError(`Network error fetching fields: ${error.message}`, {
        host: jiraHost,
        path: requestPath,
        originalError: error.message
      }));
    });

    req.end();
  });
}

/**
 * Load field map with caching
 * @param {Object} options
 * @param {number} options.ttlMs - Cache TTL in milliseconds (default: 24h)
 * @param {boolean} options.force - Force refresh from API (default: false)
 * @returns {Promise<Object>} Field map object { customfield_10020: 'Sprint', ... }
 */
async function loadFieldMap({ ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  try {
    const cachePath = getCachePath();
    
    // Try to use cached map if not forcing refresh
    if (!force) {
      const cachedMap = readCache(cachePath, ttlMs);
      if (cachedMap) {
        return cachedMap;
      }
    }
    
    // Fetch from API
    console.log('[field-map] Fetching field metadata from Jira API...');
    const fieldMap = await fetchFieldsFromApi();
    console.log(`[field-map] Loaded ${Object.keys(fieldMap).length} field mappings`);
    
    // Write to cache
    writeCache(cachePath, fieldMap);
    
    return fieldMap;
  } catch (error) {
    // Graceful fallback: return empty map so reports can continue
    console.warn(`[field-map] Failed to load field map: ${error.message}`);
    console.warn('[field-map] Falling back to raw field IDs');
    return {};
  }
}

module.exports = {
  loadFieldMap
};

