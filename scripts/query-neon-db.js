require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const { sql, count, min, max } = require('drizzle-orm');
const schema = require('../db/schema');

/**
 * Neon Database Query Helper (Drizzle ORM)
 * 
 * Quick utility to query your Neon database and verify data.
 * Uses Drizzle ORM for type-safe queries.
 * 
 * Usage:
 *   node scripts/query-neon-db.js
 *   npm run db:query
 */

async function queryDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    process.exit(1);
  }
  
  console.log('\n=== Querying Neon Database ===\n');
  
  try {
    const sqlClient = neon(databaseUrl);
    const db = drizzle(sqlClient, { schema });
    
    // Query organizations and teams
    console.log('Organizations and Teams:');
    const orgTeams = await db
      .select({
        organization: schema.organizations.name,
        team: schema.teams.name,
        teamId: schema.teams.id,
      })
      .from(schema.teams)
      .innerJoin(schema.organizations, sql`${schema.teams.organizationId} = ${schema.organizations.id}`)
      .orderBy(schema.organizations.name, schema.teams.name);
    
    console.table(orgTeams);
    
    // Query report types
    console.log('\nReport Types:');
    const reportTypes = await db
      .select({
        name: schema.reportTypes.name,
        description: schema.reportTypes.description,
      })
      .from(schema.reportTypes)
      .orderBy(schema.reportTypes.name);
    
    console.table(reportTypes);
    
    // Query daily reports count
    console.log('\nDaily Reports:');
    const dailyReports = await db
      .select({
        team: schema.teams.name,
        reportCount: count(),
        earliestDate: min(schema.dailyReports.reportDate),
        latestDate: max(schema.dailyReports.reportDate),
      })
      .from(schema.dailyReports)
      .innerJoin(schema.teams, sql`${schema.dailyReports.teamId} = ${schema.teams.id}`)
      .groupBy(schema.teams.name)
      .orderBy(schema.teams.name);
    
    if (dailyReports.length > 0) {
      console.table(dailyReports);
    } else {
      console.log('  (no daily reports yet)');
    }
    
    // Query transcripts count
    console.log('\nMeeting Transcripts:');
    const transcripts = await db
      .select({
        team: schema.teams.name,
        transcriptCount: count(),
        earliestDate: min(schema.meetingTranscripts.transcriptDate),
        latestDate: max(schema.meetingTranscripts.transcriptDate),
      })
      .from(schema.meetingTranscripts)
      .innerJoin(schema.teams, sql`${schema.meetingTranscripts.teamId} = ${schema.teams.id}`)
      .groupBy(schema.teams.name)
      .orderBy(schema.teams.name);
    
    if (transcripts.length > 0) {
      console.table(transcripts);
    } else {
      console.log('  (no transcripts yet)');
    }
    
    // Query Jira snapshots
    console.log('\nJira Snapshots:');
    const jiraSnapshots = await db
      .select({
        team: schema.teams.name,
        collectedWeekStart: schema.jiraSnapshots.collectedWeekStart,
        collectedWeekEnd: schema.jiraSnapshots.collectedWeekEnd,
        byteSize: schema.jiraSnapshots.byteSize,
      })
      .from(schema.jiraSnapshots)
      .innerJoin(schema.teams, sql`${schema.jiraSnapshots.teamId} = ${schema.teams.id}`)
      .orderBy(schema.teams.name, sql`${schema.jiraSnapshots.collectedWeekStart} DESC`);
    
    if (jiraSnapshots.length > 0) {
      console.table(jiraSnapshots);
    } else {
      console.log('  (no Jira snapshots yet)');
    }
    
    // Query Slack captures
    console.log('\nSlack Captures:');
    const slackCaptures = await db
      .select({
        team: schema.teams.name,
        collectedWeekStart: schema.slackCaptures.collectedWeekStart,
        collectedWeekEnd: schema.slackCaptures.collectedWeekEnd,
        byteSize: schema.slackCaptures.byteSize,
      })
      .from(schema.slackCaptures)
      .innerJoin(schema.teams, sql`${schema.slackCaptures.teamId} = ${schema.teams.id}`)
      .orderBy(schema.teams.name, sql`${schema.slackCaptures.collectedWeekStart} DESC`);
    
    if (slackCaptures.length > 0) {
      console.table(slackCaptures);
    } else {
      console.log('  (no Slack captures yet)');
    }
    
    console.log('\n✓ Query completed successfully!\n');
    
  } catch (error) {
    console.error('✗ Query failed:', error.message);
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  queryDatabase();
}

module.exports = { queryDatabase };
