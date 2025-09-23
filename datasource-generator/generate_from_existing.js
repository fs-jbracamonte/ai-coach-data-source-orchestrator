const fs = require('fs');
const path = require('path');
const DatasourceGenerator = require('./generate_datasources');

// Load team name mapping for project folder info
const nameMappingPath = path.join(__dirname, 'team-name-mapping.json');
const nameMapping = fs.existsSync(nameMappingPath) 
  ? require(nameMappingPath) 
  : { mappings: {} };

/**
 * Generate datasource files from existing markdown outputs
 * This script assumes the markdown files have already been generated
 * and just combines them into the datasource Python files
 */
async function generateFromExisting() {
  const generator = new DatasourceGenerator();
  
  // Get config
  const configPath = path.resolve(process.env.CONFIG_FILE || './config.json');
  console.log(`Using config file: ${configPath}`);
  const config = require(configPath);
  
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
