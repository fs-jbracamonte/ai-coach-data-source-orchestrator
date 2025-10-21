/**
 * Slack API Helpers
 * 
 * Provides helper functions for interacting with Slack API:
 * - Pagination support for conversations.list and conversations.history
 * - Rate limit handling with retry logic
 * - Date-bounded message fetching
 */

const https = require('https');
const { NetworkError } = require('../../lib/errors');
const fs = require('fs');
const path = require('path');

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make a Slack API request
 * @param {string} token - Bot token
 * @param {string} method - API method (e.g., 'conversations.list')
 * @param {Object} params - Query parameters
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} API response data
 */
function slackRequest(token, method, params = {}, debug = false) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const path = `/api/${method}${queryString ? `?${queryString}` : ''}`;
    
    const options = {
      hostname: 'slack.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'data-source-orchestrator/1.0'
      }
    };

    if (debug) {
      console.log(`[DEBUG] Request: GET ${path}`);
    }

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (debug) {
          console.log(`[DEBUG] Response status: ${res.statusCode}`);
        }

        // Handle rate limiting (429)
        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '60', 10);
          reject({ statusCode: 429, retryAfter, message: `Rate limited, retry after ${retryAfter}s` });
          return;
        }

        // Handle non-200 responses
        if (res.statusCode !== 200) {
          reject(new NetworkError(
            `Slack API returned HTTP ${res.statusCode}`,
            { statusCode: res.statusCode, response: data }
          ));
          return;
        }

        try {
          const json = JSON.parse(data);
          
          // Slack returns 200 even for errors; check ok field
          if (!json.ok) {
            const errorMsg = json.error || 'unknown_error';
            reject(new NetworkError(
              `Slack API error: ${errorMsg}`,
              { statusCode: res.statusCode, error: errorMsg, response: json }
            ));
            return;
          }

          resolve(json);
        } catch (parseError) {
          reject(new NetworkError(
            `Failed to parse Slack API response: ${parseError.message}`,
            { parseError: parseError.message, response: data }
          ));
        }
      });
    });

    req.on('error', (error) => {
      reject(new NetworkError(
        `Network request failed: ${error.message}`,
        { originalError: error.message }
      ));
    });

    req.end();
  });
}

/**
 * Fetch all channels with pagination
 * @param {string} token - Bot token
 * @param {string} types - Channel types (comma-separated)
 * @param {boolean} excludeArchived - Exclude archived channels
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Array>} Array of channel objects
 */
async function fetchAllChannels(token, types = 'public_channel,private_channel', excludeArchived = true, debug = false) {
  const channels = [];
  let cursor = '';
  let retryCount = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const params = {
        types,
        exclude_archived: excludeArchived,
        limit: 200
      };
      
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await slackRequest(token, 'conversations.list', params, debug);
      
      if (response.channels && Array.isArray(response.channels)) {
        channels.push(...response.channels);
      }

      // Check for next page
      const nextCursor = response.response_metadata?.next_cursor || '';
      if (!nextCursor) {
        break;
      }
      
      cursor = nextCursor;
      retryCount = 0; // Reset retry count on success
      
    } catch (error) {
      // Handle rate limiting
      if (error.statusCode === 429) {
        if (retryCount >= maxRetries) {
          throw new NetworkError(
            `Rate limit exceeded after ${maxRetries} retries`,
            { retryCount, lastError: error.message }
          );
        }
        
        const waitTime = error.retryAfter || 60;
        console.log(`Rate limited. Waiting ${waitTime} seconds before retry...`);
        await sleep(waitTime * 1000);
        retryCount++;
        continue;
      }
      
      throw error;
    }
  }

  return channels;
}

/**
 * Fetch message history for a channel with pagination and date filtering
 * @param {string} token - Bot token
 * @param {string} channelId - Channel ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} limit - Page size (1-1000, default 15)
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Array>} Array of message objects
 */
async function fetchChannelHistory(token, channelId, startDate, endDate, limit = 15, debug = false) {
  const messages = [];
  let cursor = '';
  let retryCount = 0;
  const maxRetries = 3;

  // Convert dates to Unix timestamps (seconds)
  const oldest = dateToUnixTimestamp(startDate, true); // Start of day
  const latest = dateToUnixTimestamp(endDate, false); // End of day

  if (debug) {
    console.log(`[DEBUG] Fetching messages from ${startDate} (${oldest}) to ${endDate} (${latest})`);
  }

  while (true) {
    try {
      const params = {
        channel: channelId,
        limit: Math.min(limit, 1000),
        oldest,
        latest,
        inclusive: true
      };
      
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await slackRequest(token, 'conversations.history', params, debug);
      
      if (response.messages && Array.isArray(response.messages)) {
        messages.push(...response.messages);
      }

      // Check for next page
      const nextCursor = response.response_metadata?.next_cursor || '';
      if (!nextCursor) {
        break;
      }
      
      cursor = nextCursor;
      retryCount = 0; // Reset retry count on success
      
    } catch (error) {
      // Handle rate limiting
      if (error.statusCode === 429) {
        if (retryCount >= maxRetries) {
          throw new NetworkError(
            `Rate limit exceeded after ${maxRetries} retries`,
            { retryCount, lastError: error.message }
          );
        }
        
        const waitTime = error.retryAfter || 60;
        console.log(`Rate limited. Waiting ${waitTime} seconds before retry...`);
        await sleep(waitTime * 1000);
        retryCount++;
        continue;
      }
      
      throw error;
    }
  }

  return messages;
}

/**
 * Fetch thread replies for a message
 * @param {string} token - Bot token
 * @param {string} channelId - Channel ID
 * @param {string} threadTs - Thread timestamp
 * @param {string} oldest - Oldest timestamp filter
 * @param {string} latest - Latest timestamp filter
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Array>} Array of reply messages
 */
async function fetchThreadReplies(token, channelId, threadTs, oldest, latest, debug = false) {
  let retryCount = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const params = {
        channel: channelId,
        ts: threadTs,
        oldest,
        latest,
        inclusive: true
      };

      const response = await slackRequest(token, 'conversations.replies', params, debug);
      
      if (response.messages && Array.isArray(response.messages)) {
        // First message is the parent, skip it
        return response.messages.slice(1);
      }

      return [];
      
    } catch (error) {
      // Handle rate limiting
      if (error.statusCode === 429) {
        if (retryCount >= maxRetries) {
          console.warn(`Could not fetch thread replies for ${threadTs}: rate limit exceeded`);
          return [];
        }
        
        const waitTime = error.retryAfter || 60;
        console.log(`Rate limited on thread fetch. Waiting ${waitTime} seconds...`);
        await sleep(waitTime * 1000);
        retryCount++;
        continue;
      }
      
      // Non-fatal: log warning and return empty
      console.warn(`Could not fetch thread replies for ${threadTs}: ${error.message}`);
      return [];
    }
  }
}

/**
 * Convert YYYY-MM-DD date string to Unix timestamp
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {boolean} startOfDay - If true, returns start of day; otherwise end of day
 * @returns {string} Unix timestamp as string
 */
function dateToUnixTimestamp(dateStr, startOfDay = true) {
  const [year, month, day] = dateStr.split('-').map(Number);
  let date;
  
  if (startOfDay) {
    date = new Date(year, month - 1, day, 0, 0, 0, 0);
  } else {
    date = new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  
  return Math.floor(date.getTime() / 1000).toString();
}

module.exports = {
  fetchAllChannels,
  fetchChannelHistory,
  fetchThreadReplies,
  dateToUnixTimestamp,
  sleep
};

/**
 * Fetch all users and build a userId -> real_name map.
 * Caches to targetPath if provided.
 * @param {string} token
 * @param {string|undefined} targetPath - optional path to write JSON map
 * @param {boolean} debug
 * @returns {Promise<Object>} userId -> name map
 */
async function fetchUserMap(token, targetPath, debug = false) {
  const map = {};
  let cursor = '';
  let retryCount = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const params = { limit: 200 };
      if (cursor) params.cursor = cursor;
      const response = await slackRequest(token, 'users.list', params, debug);
      const members = Array.isArray(response.members) ? response.members : [];
      for (const m of members) {
        if (!m || !m.id) continue;
        const profile = m.profile || {};
        const real = (profile.real_name && String(profile.real_name).trim()) || '';
        const display = (profile.display_name && String(profile.display_name).trim()) || '';
        const name = real || display || m.name || m.id;
        map[m.id] = name;
      }
      const next = response.response_metadata?.next_cursor || '';
      if (!next) break;
      cursor = next;
      retryCount = 0;
    } catch (error) {
      if (error.statusCode === 429) {
        if (retryCount >= maxRetries) break;
        const waitTime = error.retryAfter || 60;
        if (debug) console.log(`Rate limited on users.list. Waiting ${waitTime}s...`);
        await sleep(waitTime * 1000);
        retryCount++;
        continue;
      }
      // On other errors, return what we have
      break;
    }
  }

  try {
    if (targetPath) {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify(map, null, 2));
    }
  } catch (_) {
    // ignore cache write errors
  }

  return map;
}

module.exports.fetchUserMap = fetchUserMap;


