const path = require('path');

function pad2(n) { return String(n).padStart(2, '0'); }

function makeTimestamps(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const HH = pad2(now.getHours());
  const MM = pad2(now.getMinutes());
  const SS = pad2(now.getSeconds());
  return {
    today: `${yyyy}-${mm}-${dd}`,
    timestamp: `${yyyy}${mm}${dd}_${HH}${MM}${SS}`
  };
}

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function sanitizeFilename(name) {
  // Remove path separators and reserved characters
  let n = String(name || '')
    .replace(/[\\/]/g, '-')
    .replace(/[\0\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[:*?"<>|]/g, '-')
    .trim();
  // Avoid empty
  if (!n) n = 'datasource';
  return n;
}

function defaultTemplateForType(reportType) {
  if (reportType === 'weekly') return 'datasource_weekly_{project}.py';
  if (reportType === 'team') return 'datasource_{project}_team.py';
  if (reportType === '1on1') return 'datasource_{memberShort}.py';
  return 'datasource.py';
}

function buildFilename(template, context) {
  const { today, timestamp } = makeTimestamps();
  const tokens = {
    project: context.project,
    projectFolder: context.projectFolder,
    team: context.team,
    reportType: context.reportType,
    start_date: context.start_date,
    end_date: context.end_date,
    memberShort: context.memberShort,
    memberFull: context.memberFull,
    memberSlug: context.memberSlug || slugify(context.memberFull || context.memberShort || ''),
    today,
    timestamp
  };
  const tpl = template || defaultTemplateForType(context.reportType);
  let name = tpl.replace(/\{(\w+)\}/g, (_, k) => tokens[k] != null ? String(tokens[k]) : '');
  name = sanitizeFilename(name);
  if (!name.toLowerCase().endsWith('.py')) name += '.py';
  // Ensure filename only (no directories)
  name = path.basename(name);
  return name;
}

function ensureUnique(baseDir, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = filename;
  let counter = 2;
  while (true) {
    try {
      // fs not required here; callsites will check existence. We return a candidate; collision handling can be external if desired.
      return candidate; // Keep simple; let callers manage actual write checks.
    } catch (_) {
      // Unused; placeholder for future fs.existsSync if needed
      candidate = `${stem}_${counter}${ext}`;
      counter += 1;
    }
  }
}

module.exports = {
  buildFilename,
  sanitizeFilename,
  slugify,
  defaultTemplateForType,
  makeTimestamps,
  ensureUnique
};


