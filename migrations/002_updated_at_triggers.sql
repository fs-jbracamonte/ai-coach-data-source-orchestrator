-- Triggers to automatically update updated_at timestamps

-- Create the update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to organizations table
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to teams table
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to daily_reports table
DROP TRIGGER IF EXISTS update_daily_reports_updated_at ON daily_reports;
CREATE TRIGGER update_daily_reports_updated_at
    BEFORE UPDATE ON daily_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to meeting_transcripts table
DROP TRIGGER IF EXISTS update_meeting_transcripts_updated_at ON meeting_transcripts;
CREATE TRIGGER update_meeting_transcripts_updated_at
    BEFORE UPDATE ON meeting_transcripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to jira_snapshots table
DROP TRIGGER IF EXISTS update_jira_snapshots_updated_at ON jira_snapshots;
CREATE TRIGGER update_jira_snapshots_updated_at
    BEFORE UPDATE ON jira_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to slack_captures table
DROP TRIGGER IF EXISTS update_slack_captures_updated_at ON slack_captures;
CREATE TRIGGER update_slack_captures_updated_at
    BEFORE UPDATE ON slack_captures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to report_types table
DROP TRIGGER IF EXISTS update_report_types_updated_at ON report_types;
CREATE TRIGGER update_report_types_updated_at
    BEFORE UPDATE ON report_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to generated_reports table
DROP TRIGGER IF EXISTS update_generated_reports_updated_at ON generated_reports;
CREATE TRIGGER update_generated_reports_updated_at
    BEFORE UPDATE ON generated_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to report_data_links table
DROP TRIGGER IF EXISTS update_report_data_links_updated_at ON report_data_links;
CREATE TRIGGER update_report_data_links_updated_at
    BEFORE UPDATE ON report_data_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



