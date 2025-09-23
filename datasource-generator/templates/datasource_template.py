DAILY_TEXT = """{{DAILY_CONTENT}}"""

JIRA_TEXT = """{{JIRA_CONTENT}}"""

FATHOM_TEXT = """{{FATHOM_CONTENT}}"""

def get_data_sources():
    """Returns all data sources for this team member."""
    return {
        "daily_text": DAILY_TEXT,
        "jira_text": JIRA_TEXT,
        "fathom_text": FATHOM_TEXT
    }

def get_team_member_info():
    """Returns information about this team member."""
    return {
        "name": "{{TEAM_MEMBER_NAME}}",
        "generated_date": "{{GENERATED_DATE}}"
    }
