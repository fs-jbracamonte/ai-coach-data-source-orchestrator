require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

/**
 * Drop All Tables
 * 
 * Drops all tables from the database for a fresh start.
 * USE WITH CAUTION - This will delete all data!
 * 
 * Usage:
 *   node scripts/drop-all-tables.js
 */

async function dropAllTables() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    process.exit(1);
  }
  
  console.log('\n⚠️  WARNING: This will drop ALL tables and data! ⚠️\n');
  console.log(`Database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'configured'}\n`);
  
  try {
    const sql = neon(databaseUrl);
    
    console.log('Dropping all tables...\n');
    
    // Drop in correct order (foreign keys first)
    const tables = [
      'report_data_links',
      'generated_reports',
      'slack_captures',
      'jira_snapshots',
      'meeting_transcripts',
      'daily_reports',
      'report_types',
      'teams',
      'organizations',
    ];
    
    for (const table of tables) {
      try {
        // Use neon's unsafe for table name interpolation
        await sql([`DROP TABLE IF EXISTS ${table} CASCADE`]);
        console.log(`  ✓ Dropped: ${table}`);
      } catch (err) {
        console.warn(`  ⚠ Could not drop ${table}: ${err.message}`);
      }
    }
    
    console.log('\n✓ All tables dropped successfully!\n');
    console.log('Next steps:');
    console.log('  1. Run: npm run db:migrate');
    console.log('  2. Run: npm run db:seed');
    
  } catch (error) {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  dropAllTables();
}

module.exports = { dropAllTables };

