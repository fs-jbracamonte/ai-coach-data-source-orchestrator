require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

/**
 * Simple Neon Database Query Helper
 * 
 * Quick utility to query your Neon database and verify data.
 * 
 * Usage:
 *   node scripts/query-neon-db.js
 */

async function queryDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL not configured in .env');
    process.exit(1);
  }
  
  console.log('\n=== Querying Neon Database ===\n');
  
  try {
    const sql = neon(databaseUrl);
    
    // Query organizations and teams
    console.log('Organizations and Teams:');
    const orgTeams = await sql`
      SELECT o.name as organization, t.name as team, t.id as team_id
      FROM teams t 
      JOIN organizations o ON t.client_id = o.id 
      ORDER BY o.name, t.name
    `;
    console.table(orgTeams);
    
    // Query report types
    console.log('\nReport Types:');
    const reportTypes = await sql`
      SELECT name, description FROM report_types ORDER BY name
    `;
    console.table(reportTypes);
    
    // Query daily reports count
    console.log('\nDaily Reports:');
    const dailyReports = await sql`
      SELECT 
        t.name as team,
        COUNT(*) as report_count,
        MIN(report_date) as earliest_date,
        MAX(report_date) as latest_date
      FROM daily_reports dr
      JOIN teams t ON dr.project_id = t.id
      GROUP BY t.name
      ORDER BY t.name
    `;
    if (dailyReports.length > 0) {
      console.table(dailyReports);
    } else {
      console.log('  (no daily reports yet)');
    }
    
    // Query transcripts count
    console.log('\nMeeting Transcripts:');
    const transcripts = await sql`
      SELECT 
        t.name as team,
        COUNT(*) as transcript_count,
        MIN(transcript_date) as earliest_date,
        MAX(transcript_date) as latest_date
      FROM meeting_transcripts mt
      JOIN teams t ON mt.project_id = t.id
      GROUP BY t.name
      ORDER BY t.name
    `;
    if (transcripts.length > 0) {
      console.table(transcripts);
    } else {
      console.log('  (no transcripts yet)');
    }
    
    // Query Jira snapshots
    console.log('\nJira Snapshots:');
    const jiraSnapshots = await sql`
      SELECT 
        t.name as team,
        collected_week_start,
        collected_week_end,
        byte_size
      FROM jira_snapshots js
      JOIN teams t ON js.project_id = t.id
      ORDER BY t.name, collected_week_start DESC
    `;
    if (jiraSnapshots.length > 0) {
      console.table(jiraSnapshots);
    } else {
      console.log('  (no Jira snapshots yet)');
    }
    
    // Query Slack captures
    console.log('\nSlack Captures:');
    const slackCaptures = await sql`
      SELECT 
        t.name as team,
        collected_week_start,
        collected_week_end,
        byte_size
      FROM slack_captures sc
      JOIN teams t ON sc.project_id = t.id
      ORDER BY t.name, collected_week_start DESC
    `;
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


