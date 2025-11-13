/**
 * Drizzle ORM Schema for AI Coach Data Source Orchestrator
 * 
 * Defines the database schema with full type safety.
 * Used by Drizzle Kit for migrations and Drizzle ORM for queries.
 */

const { pgTable, uuid, text, timestamp, date, bigint, jsonb, index, uniqueIndex, check } = require('drizzle-orm/pg-core');
const { relations, sql } = require('drizzle-orm');

// Organizations table (clients)
const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Teams table (projects within organizations)
const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Daily reports table (one row per employee per day)
const dailyReports = pgTable('daily_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  reportDate: date('report_date').notNull(),
  content: text('content').notNull(),
  blobKey: text('blob_key'),
  blobUrl: text('blob_url'),
  authorName: text('author_name').notNull(),
  checksumSha256: text('checksum_sha256'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdIdx: index('idx_daily_reports_project_id').on(table.projectId),
  projectDateIdx: index('idx_daily_reports_project_date').on(table.projectId, table.reportDate),
  uniqueDaily: uniqueIndex('uq_daily_project_author_date').on(table.projectId, table.authorName, table.reportDate),
}));

// Meeting transcripts table (one row per transcript file)
const meetingTranscripts = pgTable('meeting_transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  transcriptDate: timestamp('transcript_date').notNull(),
  filename: text('filename').notNull(),
  transcriptText: text('transcript_text').notNull(),
  blobKey: text('blob_key'),
  blobUrl: text('blob_url'),
  byteSize: bigint('byte_size', { mode: 'number' }),
  checksumSha256: text('checksum_sha256'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdIdx: index('idx_transcripts_project_id').on(table.projectId),
  dateIdx: index('idx_transcripts_date').on(table.transcriptDate),
  projectDateIdx: index('idx_transcripts_project_date').on(table.projectId, table.transcriptDate),
  uniqueTranscript: uniqueIndex('uq_transcript_project_filename_date').on(table.projectId, table.filename, table.transcriptDate),
}));

// Jira snapshots table (weekly board snapshots)
const jiraSnapshots = pgTable('jira_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  collectedWeekStart: date('collected_week_start').notNull(),
  collectedWeekEnd: date('collected_week_end').notNull(),
  blobKey: text('blob_key').notNull(),
  blobUrl: text('blob_url').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }),
  checksumSha256: text('checksum_sha256'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdIdx: index('idx_jira_snapshots_project_id').on(table.projectId),
  projectWeekIdx: index('idx_jira_snapshots_project_week').on(table.projectId, table.collectedWeekStart),
}));

// Slack captures table (weekly Slack data)
const slackCaptures = pgTable('slack_captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  collectedWeekStart: date('collected_week_start').notNull(),
  collectedWeekEnd: date('collected_week_end').notNull(),
  blobKey: text('blob_key').notNull(),
  blobUrl: text('blob_url').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }),
  checksumSha256: text('checksum_sha256'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdIdx: index('idx_slack_captures_project_id').on(table.projectId),
  weekStartIdx: index('idx_slack_captures_week_start').on(table.collectedWeekStart),
  projectWeekIdx: index('idx_slack_captures_project_week').on(table.projectId, table.collectedWeekStart),
}));

// Report types table (lookup)
const reportTypes = pgTable('report_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Generated reports table (metadata for datasource.py files)
const generatedReports = pgTable('generated_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportTypeId: uuid('report_type_id').notNull().references(() => reportTypes.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  triggeredBy: text('triggered_by'),
  generatedAt: timestamp('generated_at').notNull(),
  executionId: text('execution_id'),
  blobKey: text('blob_key'),
  blobUrl: text('blob_url'),
  output: jsonb('output'),
  modelInfo: jsonb('model_info'),
  contentHash: text('content_hash'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  projectTypeIdx: index('idx_generated_reports_project_type_date').on(table.projectId, table.reportTypeId, table.generatedAt),
  uniqueExecutionId: uniqueIndex('uq_execution_id').on(table.executionId),
  uniqueProjectTypeHash: uniqueIndex('uq_proj_type_hash').on(table.projectId, table.reportTypeId, table.contentHash),
}));

// Report data links table (links generated reports to source data)
const reportDataLinks = pgTable('report_data_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  generatedReportId: uuid('generated_report_id').notNull().references(() => generatedReports.id, { onDelete: 'cascade' }),
  jiraSnapshotId: uuid('jira_snapshot_id').references(() => jiraSnapshots.id, { onDelete: 'cascade' }),
  slackCaptureId: uuid('slack_capture_id').references(() => slackCaptures.id, { onDelete: 'cascade' }),
  dailyReportId: uuid('daily_report_id').references(() => dailyReports.id, { onDelete: 'cascade' }),
  meetingTranscriptId: uuid('meeting_transcript_id').references(() => meetingTranscripts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  generatedReportIdx: index('idx_rdl_generated_report').on(table.generatedReportId),
  jiraSnapshotIdx: index('idx_rdl_jira_snapshot').on(table.jiraSnapshotId),
  slackCaptureIdx: index('idx_rdl_slack_capture').on(table.slackCaptureId),
  dailyReportIdx: index('idx_rdl_daily_report').on(table.dailyReportId),
  meetingTranscriptIdx: index('idx_rdl_meeting_transcript').on(table.meetingTranscriptId),
  uniqueBoard: uniqueIndex('uq_rdl_board').on(table.generatedReportId, table.jiraSnapshotId),
  uniqueSlack: uniqueIndex('uq_rdl_slack').on(table.generatedReportId, table.slackCaptureId),
  uniqueDaily: uniqueIndex('uq_rdl_daily').on(table.generatedReportId, table.dailyReportId),
  uniqueMeeting: uniqueIndex('uq_rdl_meeting').on(table.generatedReportId, table.meetingTranscriptId),
  // Check constraint: exactly one non-null foreign key
  chkExactlyOneSource: check('chk_exactly_one_source', 
    sql`num_nonnulls(jira_snapshot_id, slack_capture_id, daily_report_id, meeting_transcript_id) = 1`
  ),
}));

// Relations (optional, for relational queries)
const organizationsRelations = relations(organizations, ({ many }) => ({
  teams: many(teams),
}));

const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.clientId],
    references: [organizations.id],
  }),
  dailyReports: many(dailyReports),
  transcripts: many(meetingTranscripts),
  jiraSnapshots: many(jiraSnapshots),
  slackCaptures: many(slackCaptures),
  generatedReports: many(generatedReports),
}));

const reportTypesRelations = relations(reportTypes, ({ many }) => ({
  generatedReports: many(generatedReports),
}));

module.exports = {
  organizations,
  teams,
  dailyReports,
  meetingTranscripts,
  jiraSnapshots,
  slackCaptures,
  reportTypes,
  generatedReports,
  reportDataLinks,
  organizationsRelations,
  teamsRelations,
  reportTypesRelations,
};

