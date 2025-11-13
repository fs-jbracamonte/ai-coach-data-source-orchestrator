/**
 * Drizzle Kit Configuration
 * 
 * Configuration for Drizzle Kit CLI tools:
 * - drizzle-kit generate - Generate migrations from schema changes
 * - drizzle-kit push - Push schema directly to database
 * - drizzle-kit pull - Pull existing schema from database
 * - drizzle-kit studio - Open Drizzle Studio GUI
 */

import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineConfig({
  schema: './db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  // Use snake_case for generated SQL (matches our existing schema)
  casing: 'snake_case',
});


