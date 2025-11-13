require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const { eq } = require('drizzle-orm');
const schema = require('../db/schema');

/**
 * Neon Database Seeder (Drizzle ORM)
 * 
 * Seeds organizations, teams, and report_types into Neon database.
 * - Uses Drizzle ORM for type-safe inserts
 * - Idempotent (uses onConflictDoNothing)
 * - Environment-aware (NEON_ENV determines which UUID cache file to use)
 * - Automatically updates UUID cache file
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
    } else if (['engagepath', 'ai-coach', 'aicoach'].includes(team)) {
      mapping['Full Scale Ventures'].push(team);
    } else {
      console.warn(`⚠ Unknown team '${team}' - not mapped to any organization`);
    }
  });
  
  return mapping;
}

/**
 * Main seeding function
 */
async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    console.error('Add: DATABASE_URL=postgresql://user:pass@host/db?sslmode=require');
    process.exit(1);
  }
  
  try {
    // Initialize Drizzle
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema });
    
    console.log('Connected to database\n');
    
    // Discover teams
    const teams = discoverTeams();
    const orgMapping = mapTeamsToOrganizations(teams);
    
    const uuidCache = {
      projectId: databaseUrl.split('/').pop()?.split('?')[0] || 'neondb',
      organizations: {},
      teams: {},
      reportTypes: {}
    };
    
    // Insert organizations
    console.log('\nInserting organizations...');
    for (const orgName of Object.keys(orgMapping)) {
      const [org] = await db.insert(schema.organizations)
        .values({
          name: orgName,
          description: `${orgName} organization`,
        })
        .onConflictDoNothing()
        .returning();
      
      if (org) {
        uuidCache.organizations[orgName] = org.id;
        console.log(`  ✓ ${orgName}: ${org.id}`);
      } else {
        // Already exists, fetch it
        const [existing] = await db.select()
          .from(schema.organizations)
          .where(eq(schema.organizations.name, orgName));
        
        if (existing) {
          uuidCache.organizations[orgName] = existing.id;
          console.log(`  ✓ ${orgName}: ${existing.id} (existing)`);
        }
      }
    }
    
    // Insert teams
    console.log('\nInserting teams...');
    for (const [orgName, teamsList] of Object.entries(orgMapping)) {
      const orgId = uuidCache.organizations[orgName];
      
      if (!orgId) {
        console.error(`  ✗ Organization UUID not found for: ${orgName}`);
        continue;
      }
      
      for (const teamName of teamsList) {
        const [team] = await db.insert(schema.teams)
          .values({
            clientId: orgId,
            name: teamName,
            description: `${teamName} project`,
          })
          .onConflictDoNothing()
          .returning();
        
        if (team) {
          uuidCache.teams[teamName] = team.id;
          console.log(`  ✓ ${teamName}: ${team.id}`);
        } else {
          // Already exists, fetch it
          const [existing] = await db.select()
            .from(schema.teams)
            .where(eq(schema.teams.name, teamName));
          
          if (existing) {
            uuidCache.teams[teamName] = existing.id;
            console.log(`  ✓ ${teamName}: ${existing.id} (existing)`);
          }
        }
      }
    }
    
    // Insert report types
    console.log('\nInserting report types...');
    const reportTypesList = ['1on1', 'dashboard', 'weekly-digest'];
    
    for (const reportTypeName of reportTypesList) {
      const [reportType] = await db.insert(schema.reportTypes)
        .values({
          name: reportTypeName,
          description: `${reportTypeName} report type`,
        })
        .onConflictDoNothing()
        .returning();
      
      if (reportType) {
        uuidCache.reportTypes[reportTypeName] = reportType.id;
        console.log(`  ✓ ${reportTypeName}: ${reportType.id}`);
      } else {
        // Already exists, fetch it
        const [existing] = await db.select()
          .from(schema.reportTypes)
          .where(eq(schema.reportTypes.name, reportTypeName));
        
        if (existing) {
          uuidCache.reportTypes[reportTypeName] = existing.id;
          console.log(`  ✓ ${reportTypeName}: ${existing.id} (existing)`);
        }
      }
    }
    
    // Save UUID cache
    console.log('\nSaving UUID cache...');
    fs.writeFileSync(UUID_CACHE_FILE, JSON.stringify(uuidCache, null, 2), 'utf8');
    console.log(`  ✓ UUID cache saved to: ${path.relative(process.cwd(), UUID_CACHE_FILE)}`);
    
    console.log('\n✓ Seeding completed successfully!');
    console.log(`Environment: ${NEON_ENV}`);
    console.log(`\nUUID Cache Summary:`);
    console.log(`  Organizations: ${Object.keys(uuidCache.organizations).length}`);
    console.log(`  Teams: ${Object.keys(uuidCache.teams).length}`);
    console.log(`  Report Types: ${Object.keys(uuidCache.reportTypes).length}`);
    
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
