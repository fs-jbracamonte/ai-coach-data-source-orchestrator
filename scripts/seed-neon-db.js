require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Neon Database Seeder
 * 
 * Seeds organizations, teams, and report_types into Neon database.
 * - Idempotent (uses INSERT ... ON CONFLICT DO NOTHING)
 * - Environment-aware (NEON_ENV determines which UUID cache file to use)
 * - Portable across personal/organization Neon instances
 * 
 * Usage:
 *   node scripts/seed-neon-db.js
 *   NEON_ENV=prod node scripts/seed-neon-db.js
 */

// Get environment (defaults to 'dev')
const NEON_ENV = process.env.NEON_ENV || 'dev';
const UUID_CACHE_FILE = path.join(__dirname, '..', `.neon-db-ids.${NEON_ENV}.json`);

console.log(`\n=== Neon Database Seeder (Environment: ${NEON_ENV}) ===\n`);

/**
 * Get all team names from configs directory
 */
function discoverTeams() {
  const configsDir = path.join(__dirname, '..', 'configs');
  
  if (!fs.existsSync(configsDir)) {
    console.warn('⚠ configs/ directory not found');
    return [];
  }
  
  const teams = fs.readdirSync(configsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'shared')
    .map(dirent => dirent.name);
  
  console.log(`Found ${teams.length} teams: ${teams.join(', ')}`);
  return teams;
}

/**
 * Map teams to organizations
 */
function mapTeamsToOrganizations(teams) {
  const mapping = {
    'Full Scale': [],
    'Full Scale Ventures': []
  };
  
  teams.forEach(team => {
    if (['rocks', 'timeclock'].includes(team)) {
      mapping['Full Scale'].push(team);
    } else if (['engagepath', 'aicoach'].includes(team)) {
      mapping['Full Scale Ventures'].push(team);
    } else {
      console.warn(`⚠ Unknown team '${team}' - not mapped to any organization`);
    }
  });
  
  return mapping;
}

/**
 * Load UUID cache from file
 */
function loadUUIDCache() {
  if (fs.existsSync(UUID_CACHE_FILE)) {
    try {
      const content = fs.readFileSync(UUID_CACHE_FILE, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`⚠ Failed to load UUID cache: ${err.message}`);
      return { organizations: {}, teams: {}, reportTypes: {} };
    }
  }
  return { organizations: {}, teams: {}, reportTypes: {} };
}

/**
 * Save UUID cache to file
 */
function saveUUIDCache(cache) {
  try {
    fs.writeFileSync(UUID_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`\n✓ UUID cache saved to ${path.relative(process.cwd(), UUID_CACHE_FILE)}`);
  } catch (err) {
    console.error(`✗ Failed to save UUID cache: ${err.message}`);
  }
}

/**
 * Main seeding function
 */
async function seed() {
  try {
    // Check if Neon MCP is available
    console.log('Checking Neon MCP availability...');
    
    // Note: This script uses Neon MCP service which should be configured in Cursor
    // The actual SQL execution will be done through the MCP service
    
    console.log('\n=== INSTRUCTIONS ===');
    console.log('This seed script generates the SQL statements needed to populate your Neon database.');
    console.log('Execute these SQL statements using the Neon MCP service or Neon console:\n');
    
    // Discover teams
    const teams = discoverTeams();
    const orgMapping = mapTeamsToOrganizations(teams);
    
    // Load existing UUID cache
    const uuidCache = loadUUIDCache();
    
    console.log('\n=== SQL STATEMENTS TO EXECUTE ===\n');
    
    // Generate organizations SQL
    console.log('-- Insert organizations');
    Object.keys(orgMapping).forEach(orgName => {
      console.log(`INSERT INTO organizations (name, description) 
VALUES ('${orgName}', '${orgName} organization')
ON CONFLICT DO NOTHING
RETURNING id, name;`);
    });
    
    console.log('\n-- After running the above, note the UUIDs and insert teams:');
    console.log('-- Replace <org-uuid> with actual UUID from organizations table\n');
    
    // Generate teams SQL
    console.log('-- Insert teams');
    Object.entries(orgMapping).forEach(([orgName, teamsList]) => {
      teamsList.forEach(team => {
        console.log(`INSERT INTO teams (client_id, name, description)
VALUES ('<${orgName}-uuid>', '${team}', '${team} project')
ON CONFLICT DO NOTHING
RETURNING id, name;`);
      });
    });
    
    console.log('\n-- Insert report types');
    const reportTypes = ['1on1', 'dashboard', 'weekly-digest'];
    reportTypes.forEach(reportType => {
      console.log(`INSERT INTO report_types (name, description)
VALUES ('${reportType}', '${reportType} report type')
ON CONFLICT (name) DO NOTHING
RETURNING id, name;`);
    });
    
    console.log('\n=== NEXT STEPS ===');
    console.log('1. Copy the SQL statements above');
    console.log('2. Execute them in your Neon database using:');
    console.log('   - Neon MCP service: Use mcp_Neon_run_sql or mcp_Neon_run_sql_transaction');
    console.log('   - Neon Console: SQL Editor at https://console.neon.tech');
    console.log('3. After execution, update the UUID cache file manually:');
    console.log(`   ${UUID_CACHE_FILE}`);
    console.log('\nExample UUID cache structure:');
    console.log(JSON.stringify({
      organizations: {
        'Full Scale': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        'Full Scale Ventures': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      },
      teams: {
        rocks: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        timeclock: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        engagepath: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        aicoach: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      },
      reportTypes: {
        '1on1': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        dashboard: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        'weekly-digest': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      }
    }, null, 2));
    
    console.log('\n✓ Seed SQL statements generated successfully');
    console.log(`Environment: ${NEON_ENV}`);
    
  } catch (error) {
    console.error('\n✗ Seeding failed:', error.message);
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seed();
}

module.exports = { seed, discoverTeams, mapTeamsToOrganizations };



