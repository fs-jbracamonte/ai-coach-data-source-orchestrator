const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { handleError } = require('../lib/error-handler');
const { FileSystemError } = require('../lib/errors');
const enrichWithChangelog = require('./enrich-with-changelog');
const { getChangelogBullets } = require('./lib/changelog-markdown');
const { getProjectFolder } = require('../lib/project-folder');
const config = require('../lib/config').load();
const PROJECT_FOLDER = getProjectFolder(process.env.TEAM, config);

function getLatestEpicTreeFile() {
  const dir = path.join(__dirname, 'md_output', PROJECT_FOLDER);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /^epic_tree_.*_to_.*\.md$/.test(f));
  if (files.length === 0) return null;
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtime - fs.statSync(path.join(dir, a)).mtime);
  return path.join(dir, files[0]);
}

function extractIssueKeys(markdown) {
  const regex = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
  const set = new Set();
  let m;
  while ((m = regex.exec(markdown)) !== null) set.add(m[1]);
  return Array.from(set);
}

function injectChangelog(markdown, keyToBullets) {
  const lines = markdown.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    // If line is an issue header like #### [KEY] or ### [KEY]
    const m = lines[i].match(/^#{3,4}\s+\[([A-Z][A-Z0-9]+-\d+)\]/);
    if (m) {
      const key = m[1];
      const bullets = keyToBullets.get(key);
      if (bullets && bullets.length > 0) {
        out.push('');
        out.push('##### Changelog');
        out.push('');
        // bullets already include header lines and their change items
        bullets.forEach(b => out.push(b));
        out.push('');
      }
    }
  }
  return out.join('\n');
}

async function main() {
  try {
    const src = getLatestEpicTreeFile();
    if (!src) {
      console.log('[epic-append] No epic tree file found. Skipping.');
      return;
    }
    const content = fs.readFileSync(src, 'utf8');
    const keys = extractIssueKeys(content);
    if (keys.length === 0) {
      console.log('[epic-append] No issue keys found in epic tree.');
      return;
    }

    // Enrich to warm cache
    const issues = keys.map(k => ({ key: k }));
    console.log(`[epic-append] Preparing changelogs for ${issues.length} issues...`);
    try {
      await enrichWithChangelog(issues);
      console.log(`[epic-append] Changelog cache warmed for ${issues.length} issues.`);
    } catch (e) {
      console.warn('[epic-append] Failed to warm changelog cache (continuing):', e.message);
    }

    // Build bullets map
    const keyToBullets = new Map();
    let processed = 0;
    for (const k of keys) {
      const bullets = getChangelogBullets(k);
      keyToBullets.set(k, bullets);
      processed++;
      if (processed === 1 || processed % 25 === 0 || processed === keys.length) {
        console.log(`[epic-append] Built changelog bullets for ${processed}/${keys.length} issues...`);
      }
    }

    const enriched = injectChangelog(content, keyToBullets);
    const dir = path.dirname(src);
    const base = path.basename(src).replace(/^epic_tree_/, 'epic_tree_with_changelog_');
    const outPath = path.join(dir, base);
    fs.writeFileSync(outPath, enriched);
    console.log(`[epic-append] Wrote enriched epic tree: ${outPath}`);
  } catch (error) {
    handleError(error, { module: 'jira', operation: 'append-changelog-to-epic-tree' }, { exit: false });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


