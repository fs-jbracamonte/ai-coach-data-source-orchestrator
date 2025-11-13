/**
 * Drizzle Database Client
 * 
 * Configured Drizzle instance for Neon PostgreSQL.
 * Uses neon-http adapter for serverless environments.
 */

const { drizzle } = require('drizzle-orm/neon-http');
const { neon } = require('@neondatabase/serverless');
const schema = require('./schema');

/**
 * Get database client
 * Uses DATABASE_URL from environment
 */
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured in .env');
  }
  
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

module.exports = { getDb, schema };

