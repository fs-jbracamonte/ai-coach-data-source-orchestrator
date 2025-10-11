/**
 * Utilities to flatten Jira changelog histories into compact one-liners.
 */

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

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateYYYYMMDDHHmm(iso) {
  if (!iso) return '';
  const cfg = getConfigSafe();
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Optionally honor config.timezone if present
    const tz = cfg && (cfg.timezone || cfg.jira?.timezone);
    if (tz && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      // Format via parts in provided timezone
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
    // Local time fallback
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch (_) { return iso; }
}

function formatDateYYYYMMDD(iso) {
  if (!iso) return '';
  const cfg = getConfigSafe();
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const tz = cfg && (cfg.timezone || cfg.jira?.timezone);
    if (tz && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch (_) { return iso; }
}

function normalizeList(str) {
  if (!str) return [];
  return String(str)
    .split(',')
    .map(s => s.replace(/^\s+|\s+$/g, ''))
    .filter(Boolean);
}

function diffLists(fromList, toList) {
  const from = new Set(fromList);
  const to = new Set(toList);
  const added = Array.from(to).filter(x => !from.has(x));
  const removed = Array.from(from).filter(x => !to.has(x));
  return { added, removed };
}

function stripNoformatTags(s) {
  if (!s) return '';
  return String(s).replace(/\{noformat\}/g, '');
}

function compactItem(fieldName, item) {
  const field = (fieldName || item.field || '').trim();
  const lower = field.toLowerCase();
  const fromStr = item.fromString == null || item.fromString === '' ? '-' : String(item.fromString);
  const toStr = item.toString == null || item.toString === '' ? '-' : String(item.toString);

  const arrow = `${fromStr} → ${toStr}`;

  if (['status', 'assignee', 'priority', 'summary', 'story points', 'story point estimate'].includes(lower)) {
    const label = lower === 'story point estimate' ? 'story points' : lower;
    return `${label}: ${arrow}`;
  }

  if (lower === 'description') {
    const cleaned = stripNoformatTags(item.toString || '');
    return `description: [updated; ${cleaned.length} chars]`;
  }

  if (lower === 'labels') {
    const fromList = normalizeList(item.fromString);
    const toList = normalizeList(item.toString);
    const { added, removed } = diffLists(fromList, toList);
    const plus = added.length ? `+${added.join(',+')}` : '';
    const minus = removed.length ? `-${removed.join(',-')}` : '';
    const join = [plus, minus].filter(Boolean).join(' ');
    return `labels: ${join || '(no change)'}`;
  }

  if (lower === 'sprint') {
    const fromList = normalizeList(item.fromString);
    const toList = normalizeList(item.toString);
    const { added, removed } = diffLists(fromList, toList);
    const plus = added.length ? `+${added.join(',')}` : '';
    const minus = removed.length ? `-${removed.join(',')}` : '';
    const join = [plus, minus].filter(Boolean).join(' ');
    return `Sprint: ${join || '(no change)'}`;
  }

  if (lower === 'link' || lower === 'issuelinks') {
    const s = (item.toString || item.fromString || '').trim();
    // Try to extract relation and key (e.g., "blocks PROJ-123")
    const m = s.match(/([^\s].*?)\s+([A-Z][A-Z0-9]+-\d+)/);
    if (m) {
      return `Link: ${m[1]} ${m[2]}`;
    }
    return `Link: ${s || arrow}`;
  }

  if (lower === 'issueparentassociation' || lower === 'parent') {
    return `parent: ${arrow}`;
  }

  if (lower === 'remoteworkitemlink') {
    // Best-effort summary
    const s = (item.toString || item.fromString || '').toLowerCase();
    if (s.includes('confluence')) return 'linked Confluence page';
    if (s.includes('github')) return 'linked GitHub item';
    if (s.includes('document')) return 'linked document';
    return 'linked external item';
  }

  if (lower === 'rank') {
    // Keep Jira phrase in toString typically "Ranked higher/lower"
    return `Rank: ${toStr}`;
  }

  return `${field}: ${arrow}`;
}

/**
 * Flatten Jira changelog histories
 * @param {Array} rawChangelogValues - Array of history objects: { id, author, created, items: [] }
 * @returns {Array<{id:string,date:string,author:string,field:string,summary:string}>}
 */
function flattenChangelogs(rawChangelogValues) {
  if (!Array.isArray(rawChangelogValues)) return [];
  const entries = [];
  for (const h of rawChangelogValues) {
    const date = formatDateYYYYMMDD(h.created);
    const author = (h.author && (h.author.displayName || h.author.name || h.author.emailAddress)) || 'Unknown';
    const hid = String(h.id || '').trim() || `${Date.now()}`;
    const items = Array.isArray(h.items) ? h.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const fieldName = it.field || it.fieldId || 'field';
      const summary = compactItem(fieldName, it);
      entries.push({
        id: `${hid}:${i}`,
        historyId: hid,
        date,
        author,
        field: fieldName,
        summary
      });
    }
  }
  // Sort ascending by created (date already formatted; better sort by original created)
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

module.exports = {
  flattenChangelogs
};


