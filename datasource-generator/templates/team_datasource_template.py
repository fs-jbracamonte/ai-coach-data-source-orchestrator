# Team Datasource Template
# This template is used for generating team-level datasource files

JIRA_DATA = """{{JIRA_CONTENT}}"""

TRANSCRIPT_DATA = """{{TRANSCRIPT_CONTENT}}"""

DAILY_REPORTS_DATA = """{{DAILY_CONTENT}}"""

def get_team_data():
    """Returns all data sources for the team."""
    return {
        "project": "{{PROJECT_NAME}}",
        "jira_data": JIRA_DATA,
        "transcript_data": TRANSCRIPT_DATA,
        "daily_reports_data": DAILY_REPORTS_DATA,
        "generated_date": "{{GENERATED_DATE}}"
    }

def get_team_info():
    """Returns information about this team."""
    return {
        "project_name": "{{PROJECT_NAME}}",
        "date_range": "{{DATE_RANGE}}",
        "total_members": {{TOTAL_MEMBERS}},
        "generated_date": "{{GENERATED_DATE}}"
    }

def get_all_content():
    """Returns all content combined."""
    return f"""
# JIRA Team Report
{JIRA_DATA}

# Team Transcripts
{TRANSCRIPT_DATA}

# Daily Reports
{DAILY_REPORTS_DATA}
"""
