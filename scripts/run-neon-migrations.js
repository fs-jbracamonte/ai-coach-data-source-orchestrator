require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const { migrate } = require('drizzle-orm/neon-http/migrator');
const schema = require('../db/schema');

/**
 * Drizzle Migration Runner
 * 
 * Runs Drizzle migrations on the database specified in DATABASE_URL.
 * Uses Drizzle's built-in migrator for safe, tracked migrations.
 * 
 * For initial setup on fresh database, use: npm run db:push
 * For tracked migrations, use this script: npm run db:migrate
 * 
 * Usage:
 *   node scripts/run-neon-migrations.js
 */

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    console.error('Add: DATABASE_URL=postgresql://user:pass@host/db?sslmode=require');
    process.exit(1);
  }
  
  console.log('\n=== Running Drizzle Migrations ===\n');
  console.log(`Database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'configured'}\n`);
  
  try {
    // Initialize Drizzle with Neon HTTP adapter
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema });
    
    // Run migrations from drizzle/ directory
    console.log('Applying migrations from ./drizzle directory...');
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('  ✓ All migrations completed successfully!\n');
    
    // Verify tables
    console.log('Verifying tables...');
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    console.log(`  ✓ Found ${result.length} tables:`);
    result.forEach(t => console.log(`    - ${t.table_name}`));
    
    console.log('\n✓ Migration completed successfully!\n');
    
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
