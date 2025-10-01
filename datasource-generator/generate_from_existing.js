const fs = require('fs');
const path = require('path');
const DatasourceGenerator = require('./generate_datasources');

// Load configuration
const config = require('../lib/config').load();
const { loadTeamMapping } = require('./lib/mapping-resolver');

// Load team name mapping using shared resolver
const nameMapping = loadTeamMapping(config, __dirname);

/**
 * Generate datasource files from existing markdown outputs
 * This script assumes the markdown files have already been generated
 * and just combines them into the datasource Python files
 */
async function generateFromExisting() {
  const generator = new DatasourceGenerator();
  
  const teamMembers = config.jira.team_members || [];
  
  if (teamMembers.length === 0) {
    console.error('No team members configured in config.json');
    process.exit(1);
  }
  
  console.log(`\nGenerating datasource files for ${teamMembers.length} team members...\n`);
  
  const generatedFiles = [];
  for (const member of teamMembers) {
    const outputFile = await generator.generateDatasourceForMember(member);
    generatedFiles.push(outputFile);
  }
  
  console.log('\n=== Generation Complete ===\n');
  console.log(`Generated ${generatedFiles.length} datasource files:`);
  generatedFiles.forEach(f => console.log(`  - ${path.basename(f)}`));
}

// Run if called directly
if (require.main === module) {
  generateFromExisting().catch(console.error);
}

module.exports = generateFromExisting;
