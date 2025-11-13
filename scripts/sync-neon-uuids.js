require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const schema = require('../db/schema');

/**
 * Neon UUID Cache Sync Script
 * 
 * Queries an existing Neon database and generates the UUID cache file.
 * Useful for:
 * - New developers cloning the repo (cache file is gitignored)
 * - Working from a different machine
 * - Switching between multiple Neon environments (dev/staging/prod)
 * - Recovery if cache file is lost
 * 
 * Usage:
 *   node scripts/sync-neon-uuids.js
 *   NEON_ENV=prod node scripts/sync-neon-uuids.js
 */

// Get environment (defaults to 'dev')
const NEON_ENV = process.env.NEON_ENV || 'dev';
const UUID_CACHE_FILE = path.join(__dirname, '..', `.neon-db-ids.${NEON_ENV}.json`);

console.log(`\n=== Neon UUID Cache Sync (Environment: ${NEON_ENV}) ===\n`);

/**
 * Main sync function
 */
async function syncUUIDs() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    console.error('Add: DATABASE_URL=postgresql://user:pass@host/db?sslmode=require');
    process.exit(1);
  }
  
  console.log(`Database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'configured'}\n`);
  
  try {
    // Initialize Drizzle
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema });
    
    console.log('Querying database...\n');
    
    // Query organizations
    console.log('Fetching organizations...');
    const orgs = await db.select({
      id: schema.organizations.id,
      name: schema.organizations.name,
    }).from(schema.organizations);
    
    const orgMap = {};
    orgs.forEach(o => {
      orgMap[o.name] = o.id;
    });
    console.log(`  ✓ Found ${orgs.length} organizations`);
    
    // Query teams
    console.log('Fetching teams...');
    const teams = await db.select({
      id: schema.teams.id,
      name: schema.teams.name,
    }).from(schema.teams);
    
    const teamMap = {};
    teams.forEach(t => {
      teamMap[t.name] = t.id;
    });
    console.log(`  ✓ Found ${teams.length} teams`);
    
    // Query report types
    console.log('Fetching report types...');
    const reportTypes = await db.select({
      id: schema.reportTypes.id,
      name: schema.reportTypes.name,
    }).from(schema.reportTypes);
    
    const rtMap = {};
    reportTypes.forEach(rt => {
      rtMap[rt.name] = rt.id;
    });
    console.log(`  ✓ Found ${reportTypes.length} report types\n`);
    
    // Warnings for empty data
    if (orgs.length === 0) {
      console.warn('⚠ No organizations found in database');
    }
    if (teams.length === 0) {
      console.warn('⚠ No teams found in database');
    }
    if (reportTypes.length === 0) {
      console.warn('⚠ No report types found in database');
    }
    
    // Build cache structure
    const cache = {
      projectId: databaseUrl.split('/').pop()?.split('?')[0] || 'neondb',
      organizations: orgMap,
      teams: teamMap,
      reportTypes: rtMap,
    };
    
    // Save to file
    console.log('Saving UUID cache...');
    fs.writeFileSync(UUID_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`  ✓ UUID cache saved to: ${path.relative(process.cwd(), UUID_CACHE_FILE)}\n`);
    
    // Summary
    console.log('✓ Sync completed successfully!\n');
    console.log('UUID Cache Summary:');
    console.log(`  Organizations: ${Object.keys(orgMap).length}`);
    Object.keys(orgMap).forEach(name => console.log(`    - ${name}`));
    console.log(`  Teams: ${Object.keys(teamMap).length}`);
    Object.keys(teamMap).forEach(name => console.log(`    - ${name}`));
    console.log(`  Report Types: ${Object.keys(rtMap).length}`);
    Object.keys(rtMap).forEach(name => console.log(`    - ${name}`));
    console.log(`\nEnvironment: ${NEON_ENV}`);
    
  } catch (error) {
    console.error('\n✗ Sync failed:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.error('\nThe database appears to be empty or not initialized.');
      console.error('Run these commands first:');
      console.error('  1. npm run db:push');
      console.error('  2. npm run db:seed');
    }
    
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncUUIDs();
}

module.exports = { syncUUIDs };

