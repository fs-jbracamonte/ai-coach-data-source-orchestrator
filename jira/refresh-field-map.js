#!/usr/bin/env node

const { loadFieldMap } = require('./lib/field-map');
const { handleError } = require('../lib/error-handler');

/**
 * CLI tool to manually refresh the field map cache for the current project.
 * Usage:
 *   TEAM=engagepath node jira/refresh-field-map.js
 *   TEAM=rocks npm run jira:refresh-field-map
 *   npm run jira:refresh-field-map -- --force
 */

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  
  console.log('[refresh-field-map] Refreshing Jira field mappings...');
  if (force) {
    console.log('[refresh-field-map] Force refresh enabled (ignoring cache)');
  }
  
  try {
    const fieldMap = await loadFieldMap({ force: true }); // Always force refresh for this CLI
    const count = Object.keys(fieldMap).length;
    
    console.log(`[refresh-field-map] ✓ Successfully refreshed field map with ${count} field(s)`);
    
    if (count > 0) {
      console.log('[refresh-field-map] Sample mappings:');
      const samples = Object.entries(fieldMap).slice(0, 5);
      samples.forEach(([id, name]) => {
        console.log(`  ${id} → ${name}`);
      });
      if (count > 5) {
        console.log(`  ... and ${count - 5} more`);
      }
    }
  } catch (error) {
    handleError(error, {
      module: 'jira',
      operation: 'refresh-field-map',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = main;











