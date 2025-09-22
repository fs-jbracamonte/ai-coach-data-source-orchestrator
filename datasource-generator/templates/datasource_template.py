DAILY_TEXT = """{{DAILY_CONTENT}}"""

JIRA_TEXT = """{{JIRA_CONTENT}}"""

FATHOM_TEXT = """{{FATHOM_CONTENT}}"""

CLAAP_TEXT = """{{CLAAP_CONTENT}}"""

PROJECT_CONTEXT_AND_HEALTH = """
### Project Context
AI Coach transforms daily reports, meeting transcripts, and Jira data into coaching insights for each team member within a specific date range. By providing a 360° view of individual impact, challenges, and engagement patterns, it equips managers to walk into 1:1s prepared with actionable ideas on wins, support needs, and next steps—turning scattered data into practical guidance for more effective coaching.

### Project Health
- **Team Performance:** Strong adaptability and execution speed, with successful integration of LangChain/LangSmith and delivery of modular prompt chains. Most July sprints completed on time.  
- **Core Frustration:** Technical progress is high, but leadership is frustrated by lack of scalable validation due to manual data prep, unclear onboarding workflow, and limited automation.
- **Current Focus:** Scaling feedback validation, improving UX workflows, and building automation to close gap between technical capabilities and practical impact.
"""

def get_data_sources():
    """Returns all data sources for this team member."""
    return {
        "daily_text": DAILY_TEXT,
        "jira_text": JIRA_TEXT,
        "fathom_text": FATHOM_TEXT,
        "claap_text": CLAAP_TEXT,
        "project_context_and_health": PROJECT_CONTEXT_AND_HEALTH
    }

def get_team_member_info():
    """Returns information about this team member."""
    return {
        "name": "{{TEAM_MEMBER_NAME}}",
        "generated_date": "{{GENERATED_DATE}}"
    }
