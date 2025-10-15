const fs = require('fs');
const path = require('path');

// Prefer the datasource-generator mapping-resolver when available
let loadTeamMapping = null;
try {
  loadTeamMapping = require('../datasource-generator/lib/mapping-resolver').loadTeamMapping;
} catch (_) {
  loadTeamMapping = null;
}

function tryRequireJson(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    delete require.cache[require.resolve(jsonPath)];
    return require(jsonPath);
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the projectFolder used for scoping outputs.
 * Priority:
 * 1) datasource-generator/team-name-mapping-{team}.json (when team provided)
 * 2) mapping-resolver.loadTeamMapping(config, baseDir) → mapping.projectFolder
 * 3) config.jira.project (lowercase)
 * 4) team (as-is)
 * 5) 'default'
 *
 * @param {string|undefined} team
 * @param {object|undefined} config
 * @returns {string}
 */
function getProjectFolder(team, config) {
  // 1) Direct team-specific mapping file
  if (team && typeof team === 'string') {
    const teamMappingFile = path.join(__dirname, '..', 'datasource-generator', `team-name-mapping-${team}.json`);
    const mapping = tryRequireJson(teamMappingFile);
    if (mapping && typeof mapping.projectFolder === 'string' && mapping.projectFolder.trim()) {
      return mapping.projectFolder.trim();
    }
  }

  // 2) Use mapping-resolver if available
  try {
    if (typeof loadTeamMapping === 'function') {
      const baseDir = path.join(__dirname, '..', 'datasource-generator');
      const mapping = loadTeamMapping(config || {}, baseDir);
      if (mapping && typeof mapping.projectFolder === 'string' && mapping.projectFolder && mapping.projectFolder !== 'default') {
        return mapping.projectFolder;
      }
    }
  } catch (_) {
    // ignore and continue fallbacks
  }

  // 3) Fallback to jira.project (lowercase)
  const proj = config && config.jira && config.jira.project ? String(config.jira.project).toLowerCase() : null;
  if (proj && proj.trim()) return proj.trim();

  // 4) Fallback to team param
  if (team && typeof team === 'string' && team.trim()) return team.trim();

  // 5) Default
  return 'default';
}

module.exports = { getProjectFolder };





