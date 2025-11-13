-- Initial Schema for AI Coach Data Source Orchestrator
-- PostgreSQL database for storing generated data sources

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (clients)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Teams table (projects within organizations)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Daily reports table (one row per employee per day)
CREATE TABLE IF NOT EXISTS daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    content TEXT NOT NULL,
    blob_key TEXT,
    blob_url TEXT,
    author_name TEXT NOT NULL,
    checksum_sha256 TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_project_author_date UNIQUE (project_id, author_name, report_date)
);

-- Indexes for daily_reports
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date ON daily_reports(project_id, report_date);

-- Meeting transcripts table (one row per transcript file)
CREATE TABLE IF NOT EXISTS meeting_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    transcript_date TIMESTAMP NOT NULL,
    filename TEXT NOT NULL,
    transcript_text TEXT NOT NULL,
    blob_key TEXT,
    blob_url TEXT,
    byte_size BIGINT,
    checksum_sha256 TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transcript_project_filename_date UNIQUE (project_id, filename, transcript_date)
);

-- Indexes for meeting_transcripts
CREATE INDEX IF NOT EXISTS idx_transcripts_project_id ON meeting_transcripts(project_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_date ON meeting_transcripts(transcript_date);
CREATE INDEX IF NOT EXISTS idx_transcripts_project_date ON meeting_transcripts(project_id, transcript_date);

-- Jira snapshots table (weekly board snapshots stored as blob references)
CREATE TABLE IF NOT EXISTS jira_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    collected_week_start DATE NOT NULL,
    collected_week_end DATE NOT NULL,
    blob_key TEXT NOT NULL,
    blob_url TEXT NOT NULL,
    byte_size BIGINT,
    checksum_sha256 TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for jira_snapshots
CREATE INDEX IF NOT EXISTS idx_jira_snapshots_project_id ON jira_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_jira_snapshots_project_week ON jira_snapshots(project_id, collected_week_start);

-- Slack captures table (weekly Slack data stored as blob references)
CREATE TABLE IF NOT EXISTS slack_captures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    collected_week_start DATE NOT NULL,
    collected_week_end DATE NOT NULL,
    blob_key TEXT NOT NULL,
    blob_url TEXT NOT NULL,
    byte_size BIGINT,
    checksum_sha256 TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for slack_captures
CREATE INDEX IF NOT EXISTS idx_slack_captures_project_id ON slack_captures(project_id);
CREATE INDEX IF NOT EXISTS idx_slack_captures_week_start ON slack_captures(collected_week_start);
CREATE INDEX IF NOT EXISTS idx_slack_captures_project_week ON slack_captures(project_id, collected_week_start);

-- Report types table (lookup table for report types)
CREATE TABLE IF NOT EXISTS report_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Generated reports table (metadata for generated datasource.py files)
CREATE TABLE IF NOT EXISTS generated_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type_id UUID NOT NULL REFERENCES report_types(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    triggered_by TEXT,
    generated_at TIMESTAMP NOT NULL,
    execution_id TEXT,
    blob_key TEXT,
    blob_url TEXT,
    output JSONB,
    model_info JSONB,
    content_hash TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_execution_id UNIQUE (execution_id),
    CONSTRAINT uq_proj_type_hash UNIQUE (project_id, report_type_id, content_hash)
);

-- Indexes for generated_reports
CREATE INDEX IF NOT EXISTS idx_generated_reports_project_type_date ON generated_reports(project_id, report_type_id, generated_at);

-- Report data links table (links generated reports to source data)
CREATE TABLE IF NOT EXISTS report_data_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generated_report_id UUID NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
    jira_snapshot_id UUID REFERENCES jira_snapshots(id) ON DELETE CASCADE,
    slack_capture_id UUID REFERENCES slack_captures(id) ON DELETE CASCADE,
    daily_report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
    meeting_transcript_id UUID REFERENCES meeting_transcripts(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Enforce exactly one non-null foreign key
    CONSTRAINT chk_exactly_one_source CHECK (
        num_nonnulls(jira_snapshot_id, slack_capture_id, daily_report_id, meeting_transcript_id) = 1
    ),
    -- Unique constraints to prevent duplicate links
    CONSTRAINT uq_rdl_board UNIQUE (generated_report_id, jira_snapshot_id),
    CONSTRAINT uq_rdl_slack UNIQUE (generated_report_id, slack_capture_id),
    CONSTRAINT uq_rdl_daily UNIQUE (generated_report_id, daily_report_id),
    CONSTRAINT uq_rdl_meeting UNIQUE (generated_report_id, meeting_transcript_id)
);

-- Indexes for report_data_links
CREATE INDEX IF NOT EXISTS idx_rdl_generated_report ON report_data_links(generated_report_id);
CREATE INDEX IF NOT EXISTS idx_rdl_jira_snapshot ON report_data_links(jira_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rdl_slack_capture ON report_data_links(slack_capture_id);
CREATE INDEX IF NOT EXISTS idx_rdl_daily_report ON report_data_links(daily_report_id);
CREATE INDEX IF NOT EXISTS idx_rdl_meeting_transcript ON report_data_links(meeting_transcript_id);



