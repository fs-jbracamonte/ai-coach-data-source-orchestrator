const fs = require('fs');
const path = require('path');

const { flattenChangelogs } = require('./changelog-flatten');
const configModule = require('../../lib/config');

function getConfigSafe() {
  try {
    if (process.env.TEAM && process.env.REPORT_TYPE) {
      return configModule.ConfigManager.loadForReportType(process.env.TEAM, process.env.REPORT_TYPE);
    }
    return configModule.load();
  } catch (_) {
    return null;
  }
}

function parseIsoDate(value) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const CACHE_DIR = path.join(__dirname, '..', 'data', 'changelogs');
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function readFreshCache(issueKey) {
  try {
    const p = path.join(CACHE_DIR, `${issueKey}.json`);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    const age = Date.now() - stat.mtimeMs;
    if (age > TTL_MS) return null;
    const text = fs.readFileSync(p, 'utf8');
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function getChangelogBullets(issueKey, rawHistories) {
  try {
    const histories = Array.isArray(rawHistories) ? rawHistories : (readFreshCache(issueKey) || []);
    let entries = flattenChangelogs(histories);

    // Filter entries by configured end_date (inclusive) if available
    const cfg = getConfigSafe();
    const endStr = cfg?.jira?.end_date;
    if (endStr) {
      const endDate = parseIsoDate(endStr);
      if (endDate) {
        const endKey = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')} 23:59`;
        entries = entries.filter(e => typeof e.date === 'string' && e.date <= endKey);
      }
    }
    if (!entries || entries.length === 0) return [];

    // Group by historyId (readable block format)
    const groups = new Map();
    for (const e of entries) {
      const key = e.historyId || `${e.date}__${e.author}`;
      if (!groups.has(key)) groups.set(key, { date: e.date, author: e.author, items: [] });
      groups.get(key).items.push(e.summary);
    }

    const blocks = [];
    // Keep chronological order by date by iterating entries sequence and tracking first-seen keys
    const seen = new Set();
    for (const e of entries) {
      const key = e.historyId || `${e.date}__${e.author}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groups.get(key);
      blocks.push(`${g.date} ${g.author}`);
      for (const item of g.items) blocks.push(`- ${item}`);
      blocks.push('');
    }
    return blocks;
  } catch (_) {
    return [];
  }
}

module.exports = {
  getChangelogBullets
};


