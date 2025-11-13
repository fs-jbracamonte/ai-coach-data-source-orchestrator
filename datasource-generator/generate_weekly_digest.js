require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration (deferred)
const configModule = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError } = require('../lib/errors');
const { loadTeamMapping } = require('./lib/mapping-resolver');

// CLI args and hierarchical config support
function parseArgs(argv) {
  const args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--team' || a === '-t') args.team = argv[++i];
    else if (a === '--report' || a === '-r') args.report = argv[++i];
  }
  return args;
}

function getAvailableTeams() {
  try {
    const configsDir = path.join(__dirname, '..', 'configs');
    if (!fs.existsSync(configsDir)) return [];
    return fs.readdirSync(configsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'shared')
      .map(d => d.name);
  } catch (_) { return []; }
}

function printHelp() {
  const teams = getAvailableTeams();
  console.log('\nUsage:');
  console.log('  node datasource-generator/generate_weekly_digest.js --team <team> --report weekly');
  console.log('\nOptions:');
  console.log('  --team, -t     Team name (e.g., rocks, engagepath)');
  console.log('  --report, -r   Report type (must be weekly for this script)');
  console.log('  --help, -h     Show this help');
  console.log('\nAvailable teams:', teams.length ? teams.join(', ') : '(none found)');
  console.log('Allowed report types: weekly');
  console.log('\nExamples:');
  console.log('  node datasource-generator/generate_weekly_digest.js --team rocks --report weekly');
  console.log('  CONFIG_FILE=config.rocks.json node datasource-generator/generate_weekly_digest.js');
}

let config;
let nameMapping;
(() => {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }

    if (args.team && args.report) {
      if (args.report !== 'weekly') {
        throw new ConfigurationError("Invalid report type for generate_weekly_digest.js. Expected 'weekly'", {
          reportType: args.report,
          expected: 'weekly'
        });
      }
      process.env.TEAM = args.team;
      process.env.REPORT_TYPE = 'weekly';
      console.log(`[config] Using hierarchical config: TEAM=${args.team}, REPORT_TYPE=weekly`);
      config = configModule.ConfigManager.loadForReportType(args.team, 'weekly');
    } else {
      console.log(`[config] Using legacy single-file config: ${process.env.CONFIG_FILE || 'config.json'}`);
      config = configModule.load();
    }

    // Load team name mapping using shared resolver
    nameMapping = loadTeamMapping(config, __dirname);
  } catch (error) {
    handleError(error, {
      module: 'datasource-generator',
      operation: 'init-generate-weekly-digest',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
})();

class WeeklyDigestGenerator {
  constructor() {
    // Get project name from config or use projectFolder from mapping
    this.projectName = config.jira?.project || nameMapping.projectFolder || 'team';
    const { getProjectFolder } = require('../lib/project-folder');
    const pf = getProjectFolder(process.env.TEAM, config);
    this.outputDir = path.join(__dirname, 'output', pf);
    this.templatePath = path.join(__dirname, 'templates', 'team_datasource_template.py');
    const pf2 = pf;
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output', pf2);
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output', pf2);
    this.slackDir = path.join(__dirname, '..', 'slack', 'md-output', pf2, 'sanitized');
    this.dailyReportsDir = path.join(__dirname, '..', 'daily-reports', 'md-output', pf2);
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Run a command and wait for it to complete
   */
  async runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      console.log(`Running: ${command} ${args.join(' ')}`);
      
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(__dirname, '..')
      });

      child.on('error', (error) => {
        console.error(`Error running ${command}:`, error);
        reject(error);
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the most recent team report file
   */
  getTeamReportFile() {
    if (!fs.existsSync(this.jiraDir)) {
      console.warn(`Jira output directory not found: ${this.jiraDir}`);
      return null;
    }

    const files = fs.readdirSync(this.jiraDir)
      .filter(file => file.includes('team_report.md'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(this.jiraDir, a));
        const statB = fs.statSync(path.join(this.jiraDir, b));
        return statB.mtime - statA.mtime;
      });

    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get the most recent epic tree file
   */
  getEpicTreeFile() {
    if (!fs.existsSync(this.jiraDir)) {
      console.warn(`Jira output directory not found: ${this.jiraDir}`);
      return null;
    }

    const files = fs.readdirSync(this.jiraDir)
      .filter(file => /^(epic_tree_|epic_tree_with_changelog_).*_to_.*\.md$/.test(file))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(this.jiraDir, a));
        const statB = fs.statSync(path.join(this.jiraDir, b));
        return statB.mtime - statA.mtime;
      });

    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get all individual assignee markdown files from by-assignee directory
   */
  getIndividualAssigneeFiles() {
    const byAssigneeDir = path.join(this.jiraDir, 'by-assignee');
    
    if (!fs.existsSync(byAssigneeDir)) {
      console.warn(`By-assignee directory not found: ${byAssigneeDir}`);
      return [];
    }

    return fs.readdirSync(byAssigneeDir)
      .filter(file => file.endsWith('.md'))
      .sort();
  }

  /**
   * Get all daily report files
   */
  getDailyReportFiles() {
    if (!fs.existsSync(this.dailyReportsDir)) {
      console.warn(`Daily reports directory not found: ${this.dailyReportsDir}`);
      return [];
    }

    return fs.readdirSync(this.dailyReportsDir)
      .filter(file => file.endsWith('.md'))
      .sort();
  }

  /**
   * Get all transcript files (with optional date filtering)
   */
  getTranscriptFiles() {
    if (!fs.existsSync(this.transcriptsDir)) {
      console.warn(`Transcripts directory not found: ${this.transcriptsDir}`);
      return [];
    }

    const { parseTranscriptDateFromFilename, isWithinRange } = require('./lib/date-range-filter');
    
    // Check if date filtering is enabled
    const dateFilter = config.transcripts?.dateFilter;
    const filterEnabled = dateFilter?.enabled === true;
    const startDate = dateFilter?.startDate;
    const endDate = dateFilter?.endDate;

    // Check if there are subdirectories (when organizeByFolder is true)
    const items = fs.readdirSync(this.transcriptsDir);
    const transcriptFiles = [];

    items.forEach(item => {
      const itemPath = path.join(this.transcriptsDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // If it's a directory, get all .md files from it
        const files = fs.readdirSync(itemPath)
          .filter(file => file.endsWith('.md'))
          .map(file => path.join(item, file));
        transcriptFiles.push(...files);
      } else if (item.endsWith('.md')) {
        // If it's a file, add it directly
        transcriptFiles.push(item);
      }
    });

    // Filter by date if enabled
    if (filterEnabled && startDate && endDate) {
      const filtered = transcriptFiles.filter(file => {
        const date = parseTranscriptDateFromFilename(file);
        if (!date) {
          console.warn(`  ⚠ Cannot parse date from transcript filename, excluding: ${file}`);
          return false;
        }
        return isWithinRange(date, startDate, endDate);
      });
      
      const excluded = transcriptFiles.length - filtered.length;
      if (excluded > 0) {
        console.log(`  Filtered transcripts: ${filtered.length} in range, ${excluded} excluded`);
      }
      
      return filtered.sort();
    }

    return transcriptFiles.sort();
  }

  /**
   * Read file content or return empty string
   */
  readFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.warn(`Could not read file ${filePath}:`, error.message);
      return '';
    }
  }

  /**
   * Convert plain Jira issue keys like [ABC-123] into clickable links
   * while avoiding already-linked patterns like [ABC-123](...)
   */
  linkifyIssueKeys(content) {
    try {
      const host = config?.jira?.host ? String(config.jira.host) : '';
      if (!host) return content;
      const jiraHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const base = `https://${jiraHost}`;
      // Match [ABC-123] not already followed by '(' (i.e., not already a link)
      return content.replace(/(^|[^!])\[([A-Z][A-Z0-9]+-\d+)\](?!\()/g, (m, prefix, key) => `${prefix}[${key}](${base}/browse/${key})`);
    } catch (_) {
      return content;
    }
  }

  /**
   * Generate the weekly digest datasource file
   */
  generateWeeklyDigest() {
    console.log(`\n=== Generating Weekly Digest for ${this.projectName} ===\n`);

    // Prefer Epic Tree (weekly-only) -> Team report -> Individual reports
    const epicTreeFile = this.getEpicTreeFile();
    const teamReportFile = this.getTeamReportFile();
    const assigneeFiles = this.getIndividualAssigneeFiles();
    let jiraContent = '';
    let usedSource = 'none';

    if (epicTreeFile) {
      const isEnriched = epicTreeFile.startsWith('epic_tree_with_changelog_');
      console.log(`Found epic tree${isEnriched ? ' (enriched)' : ''}: ${epicTreeFile}`);
      jiraContent = this.readFileContent(path.join(this.jiraDir, epicTreeFile));
      usedSource = 'epic-tree';
    } else if (teamReportFile) {
      console.log(`Found team report: ${teamReportFile}`);
      jiraContent = this.readFileContent(path.join(this.jiraDir, teamReportFile));
      usedSource = 'team-report';
    } else if (assigneeFiles.length > 0) {
      console.log(`Found ${assigneeFiles.length} individual assignee reports`);

      // Create a header for the combined JIRA content
      jiraContent = `# JIRA Reports - ${this.projectName}\n\n`;
      jiraContent += `**Project**: ${this.projectName}\n`;
      jiraContent += `**Date Range**: ${config.jira?.start_date || 'N/A'} to ${config.jira?.end_date || 'N/A'}\n`;
      jiraContent += `**Generated**: ${new Date().toLocaleString()}\n\n`;

      // Combine all individual assignee reports
      assigneeFiles.forEach((file, index) => {
        const content = this.readFileContent(path.join(this.jiraDir, 'by-assignee', file));
        if (content) {
          // Extract assignee name from filename (format: ROCKS_2025-09-22_to-2025-09-26_FirstName_LastName.md)
          const assigneeName = file.replace(/^.*?_to_.*?_(.+)\.md$/, '$1').replace(/_/g, ' ');

          jiraContent += `## ${assigneeName}\n\n`;
          jiraContent += content;
          if (index < assigneeFiles.length - 1) {
            jiraContent += '\n\n---\n\n';
          }
        }
      });
      usedSource = 'by-assignee';
    } else {
      console.warn('No JIRA team report or individual assignee reports found');
    }

    // Ensure issue keys inside the JIRA content are clickable links
    jiraContent = this.linkifyIssueKeys(jiraContent);

    // Get all daily report files
    const dailyReportFiles = this.getDailyReportFiles();
    console.log(`Found ${dailyReportFiles.length} daily report files`);

    // Combine all daily report content (with date range trimming)
    const { trimDailyMarkdownToRange } = require('./lib/date-range-filter');
    const startDate = config.dailyReports?.query?.report_date_start;
    const endDate = config.dailyReports?.query?.report_date_end;
    
    let dailyReportContent = '';
    let includedCount = 0;
    let excludedCount = 0;
    
    dailyReportFiles.forEach(file => {
      let content = this.readFileContent(path.join(this.dailyReportsDir, file));
      
      // Trim to date range if configured
      if (content && startDate && endDate) {
        content = trimDailyMarkdownToRange(content, startDate, endDate);
      }
      
      if (content) {
        dailyReportContent += content;
        dailyReportContent += '\n\n---\n\n';
        includedCount++;
      } else {
        excludedCount++;
      }
    });
    
    if (excludedCount > 0) {
      console.log(`  Filtered daily reports: ${includedCount} with in-range content, ${excludedCount} excluded`);
    }

    // Get all transcript files
    const transcriptFiles = this.getTranscriptFiles();
    console.log(`Found ${transcriptFiles.length} transcript files`);

    // Combine all transcript content
    let transcriptContent = '';
    transcriptFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.transcriptsDir, file));
      if (content) {
        // Add file header
        transcriptContent += `\n# Transcript: ${file}\n\n`;
        transcriptContent += content;
        transcriptContent += '\n\n---\n\n';
      }
    });

    // ---- Prepend computed summaries to each section ----
    function summarizeJira(content, source) {
      // Epic tree parser
      function parseEpicTree() {
        const keyRegex = /\[([A-Z]+-\d+)\]/g;
        const uniqueKeys = new Set();
        let m;
        while ((m = keyRegex.exec(content)) !== null) uniqueKeys.add(m[1]);
        const total = uniqueKeys.size;

        const byAssignee = {};
        content.split('\n').forEach(line => {
          const m1 = line.match(/\*\*Assignee\*\*:\s*(.+)$/) || line.match(/Assignee:\s*(.+)$/);
          if (m1) {
            const name = m1[1].trim();
            if (name) byAssignee[name] = (byAssignee[name] || 0) + 1;
          }
        });

        const byStatus = {};
        content.split('\n').forEach(line => {
          const m1 = line.match(/\*\*Status\*\*:\s*(.+)$/) || line.match(/Status:\s*(.+)$/);
          if (m1) {
            const status = m1[1].trim();
            if (status) byStatus[status] = (byStatus[status] || 0) + 1;
          }
        });
        return { total, byStatus, byAssignee };
      }

      // Team report parser
      function parseTeamReport() {
        const byStatus = {};
        content.split('\n').forEach(line => {
          const m = line.match(/^###\s+([^()]+)\s+\((\d+)\)/);
          if (m) byStatus[m[1].trim()] = parseInt(m[2], 10);
        });
        const totalMatch = content.match(/\*\*Total Tickets\*\*:\s*(\d+)/);
        let total = totalMatch ? parseInt(totalMatch[1], 10) : null;

        // By assignee from Team Member Details section
        const byAssignee = {};
        let inSection = false;
        content.split('\n').forEach(line => {
          if (line.trim() === '## Team Member Details') { inSection = true; return; }
          if (inSection && line.startsWith('## ')) { inSection = false; return; }
          if (inSection) {
            const m = line.trim().match(/^###\s+(.+?)\s+\((\d+) tickets\)/);
            if (m) byAssignee[m[1].trim()] = parseInt(m[2], 10);
          }
        });
        if (total == null) {
          const keyRegex = /\[([A-Z]+-\d+)\]/g;
          const uniqueKeys = new Set();
          let m;
          while ((m = keyRegex.exec(content)) !== null) uniqueKeys.add(m[1]);
          total = uniqueKeys.size;
        }
        return { total, byStatus, byAssignee };
      }

      // Individual combined parser
      function parseIndividuals() {
        const byAssignee = {};
        let current = null;
        content.split('\n').forEach(line => {
          if (line.startsWith('## ') && !line.startsWith('## Tickets by Status')) {
            current = line.replace(/^##\s+/, '').trim();
            if (current) byAssignee[current] = 0;
          } else if (current && /\[([A-Z]+-\d+)\]/.test(line)) {
            byAssignee[current] += 1;
          }
        });
        const keyRegex = /\[([A-Z]+-\d+)\]/g;
        const uniqueKeys = new Set();
        let m;
        while ((m = keyRegex.exec(content)) !== null) uniqueKeys.add(m[1]);
        return { total: uniqueKeys.size, byStatus: {}, byAssignee };
      }

      let summary;
      if (source === 'epic-tree') summary = parseEpicTree();
      else if (source === 'team-report') summary = parseTeamReport();
      else summary = parseIndividuals();

      let header = '## JIRA Summary\n\n';
      header += `**Total Tickets**: ${summary.total}  \n\n`;
      if (Object.keys(summary.byStatus).length) {
        header += '### By Status\n';
        Object.entries(summary.byStatus).forEach(([k, v]) => { header += `- **${k}**: ${v}\n`; });
        header += '\n';
      }
      if (Object.keys(summary.byAssignee).length) {
        header += '### By Assignee\n';
        Object.entries(summary.byAssignee).forEach(([k, v]) => { header += `- **${k}**: ${v}\n`; });
        header += '\n';
      }
      return header + '---\n\n' + content;
    }

    function summarizeDaily(content) {
      const totalReports = (content.match(/# Daily Report:/g) || []).length;
      const employees = new Set();
      const empRegex = /\*\*Employee\*\*:\s*([^\n]+)/g;
      let m;
      while ((m = empRegex.exec(content)) !== null) employees.add(m[1].trim());
      const dateRegex = /^##\s+(\d{4}-\d{2}-\d{2})/gm;
      const dates = [];
      let d;
      while ((d = dateRegex.exec(content)) !== null) dates.push(d[1]);
      const start = dates.length ? dates.slice().sort()[0] : null;
      const end = dates.length ? dates.slice().sort()[dates.length - 1] : null;
      let header = '## Daily Reports Summary\n\n';
      header += `**Total Reports**: ${totalReports}  \n`;
      header += `**Unique Employees**: ${employees.size}  \n`;
      if (start && end) header += `**Date Range**: ${start} to ${end}  \n`;
      header += '\n---\n\n';
      return header + content;
    }

    function summarizeTranscripts(content) {
      const count = (content.match(/# Transcript:/g) || []).length;
      let header = '## Transcripts Summary\n\n';
      header += `**Total Transcripts**: ${count}  \n\n`;
      header += '---\n\n';
      return header + content;
    }

    jiraContent = summarizeJira(jiraContent, usedSource);
    dailyReportContent = summarizeDaily(dailyReportContent);
    transcriptContent = summarizeTranscripts(transcriptContent);

    // Create the Python datasource file
    let pythonContent = '';
    
    // Add header
    pythonContent += `# Weekly Digest Datasource for ${this.projectName}\n`;
    pythonContent += `# Generated on ${new Date().toLocaleString()}\n\n`;

    // Add JIRA data
    pythonContent += 'JIRA_DATA = """';
    pythonContent += jiraContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add daily reports data
    pythonContent += 'DAILY_REPORTS_DATA = """';
    pythonContent += dailyReportContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add transcript data
    pythonContent += 'TRANSCRIPT_DATA = """';
    pythonContent += transcriptContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add helper functions
    pythonContent += `def get_weekly_digest_data():
    """Returns all data sources for the weekly digest."""
    return {
        "project": "${this.projectName}",
        "jira_data": JIRA_DATA,
        "daily_reports_data": DAILY_REPORTS_DATA,
        "transcript_data": TRANSCRIPT_DATA,
        "generated_date": "${new Date().toISOString()}"
    }

def get_jira_summary():
    """Extracts summary statistics from JIRA data.
    Supports Epic Tree (preferred), Team report, and Individual formats.
    """
    import re
    
    def is_epic_tree():
        return '# Epic Tree' in JIRA_DATA

    def parse_epic_tree():
        keys = re.findall(r'\\[([A-Z]+-\\d+)\\]', JIRA_DATA)
        total = len(set(keys))
        by_assignee = {}
        for line in JIRA_DATA.split('\\n'):
            m = re.search(r'(\\*\\*Assignee\\*\\*:\\s*|Assignee:\\s*)(.+)$', line.strip())
            if m:
                name = m.group(2).strip()
                if name:
                    by_assignee[name] = by_assignee.get(name, 0) + 1
        by_status = {}
        for line in JIRA_DATA.split('\\n'):
            m = re.search(r'(\\*\\*Status\\*\\*:\\s*|Status:\\s*)(.+)$', line.strip())
            if m:
                status = m.group(2).strip()
                if status:
                    by_status[status] = by_status.get(status, 0) + 1
        return total, by_status, by_assignee

    def parse_team_report():
        def parse_status_counts():
            counts = {}
            for line in JIRA_DATA.split('\\n'):
                m = re.match(r'### ([^(]+) \\((\\d+)\\)', line)
                if m:
                    counts[m.group(1).strip()] = int(m.group(2))
            return counts
        def parse_total_from_team():
            m = re.search(r'\\*\\*Total Tickets\\*\\*: (\\d+)', JIRA_DATA)
            return int(m.group(1)) if m else None
        def parse_assignee_counts_from_team_details():
            counts = {}
            in_section = False
            for line in JIRA_DATA.split('\\n'):
                if line.strip() == '## Team Member Details':
                    in_section = True
                    continue
                if in_section and line.startswith('## '):
                    break
                if in_section:
                    m = re.match(r'### (.+?) \\((\\d+) tickets\\)', line.strip())
                    if m:
                        counts[m.group(1).strip()] = int(m.group(2))
            return counts
        status_counts = parse_status_counts()
        total = parse_total_from_team()
        if total is None:
            all_keys = set(re.findall(r'\\[([A-Z]+-\\d+)\\]', JIRA_DATA))
            total = len(all_keys)
        assignee_counts = parse_assignee_counts_from_team_details()
        return total, status_counts, assignee_counts

    def parse_individuals():
        counts = {}
        current_assignee = None
        for line in JIRA_DATA.split('\\n'):
            if line.startswith('## ') and not line.startswith('## Tickets by Status'):
                current_assignee = line.replace('## ', '').strip()
                counts[current_assignee] = 0
            elif current_assignee and re.match(r'\\[([A-Z]+-\\d+)\\]', line):
                counts[current_assignee] += 1
        all_keys = set(re.findall(r'\\[([A-Z]+-\\d+)\\]', JIRA_DATA))
        return len(all_keys), {}, counts

    if is_epic_tree():
        total, by_status, by_assignee = parse_epic_tree()
        return {"total_tickets": total, "by_status": by_status, "by_assignee": by_assignee}

    total, by_status, by_assignee = parse_team_report()
    if not by_assignee:
        total, by_status, by_assignee = parse_individuals()
    return {"total_tickets": total, "by_status": by_status, "by_assignee": by_assignee}

def get_daily_reports_summary():
    """Returns summary of daily reports included."""
    import re
    
    # Count unique employees
    employee_pattern = r'\\*\\*Employee\\*\\*: ([^\\n]+)'
    employees = set(re.findall(employee_pattern, DAILY_REPORTS_DATA))
    
    # Count report entries
    report_pattern = r'# Daily Report: '
    report_count = len(re.findall(report_pattern, DAILY_REPORTS_DATA))
    
    # Count dates
    date_pattern = r'## (\\d{4}-\\d{2}-\\d{2})'
    dates = set(re.findall(date_pattern, DAILY_REPORTS_DATA))
    
    return {
        "total_reports": report_count,
        "unique_employees": len(employees),
        "employee_names": list(employees),
        "date_range": {
            "start": min(dates) if dates else None,
            "end": max(dates) if dates else None,
            "total_days": len(dates)
        }
    }

def get_transcript_count():
    """Returns the number of transcripts included."""
    import re
    pattern = r'# Transcript: '
    return len(re.findall(pattern, TRANSCRIPT_DATA))

def search_content(keyword, data_type="all"):
    """Search for a keyword in the specified data type."""
    keyword_lower = keyword.lower()
    results = []
    
    if data_type in ["all", "jira"]:
        for line in JIRA_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("JIRA", line.strip()))
    
    if data_type in ["all", "daily"]:
        for line in DAILY_REPORTS_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("Daily Report", line.strip()))
    
    if data_type in ["all", "transcript"]:
        for line in TRANSCRIPT_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("Transcript", line.strip()))
    
    return results

def get_employee_reports(employee_name):
    """Get all daily report entries for a specific employee."""
    import re
    
    entries = []
    current_entry = None
    in_employee_section = False
    
    for line in DAILY_REPORTS_DATA.split('\\n'):
        if '**Employee**:' in line and employee_name.lower() in line.lower():
            in_employee_section = True
            current_entry = {"employee": line, "content": []}
        elif in_employee_section:
            if line.startswith('## ') or line.startswith('# Daily Report:'):
                if current_entry and current_entry["content"]:
                    entries.append(current_entry)
                in_employee_section = False
                current_entry = None
            elif current_entry:
                current_entry["content"].append(line)
    
    if current_entry and current_entry["content"]:
        entries.append(current_entry)
    
    return entries
`;

    // Write the file (configurable filename)
    const { buildFilename } = require('./lib/output-filename');
    const template = (config && config.outputFilenames && config.outputFilenames.weekly) || null;
    const projectFolder = (typeof nameMapping?.projectFolder === 'string' && nameMapping.projectFolder) || this.projectName.toLowerCase();
    const outputFileName = buildFilename(template, {
      project: this.projectName,
      projectFolder,
      team: process.env.TEAM || '',
      reportType: 'weekly',
      start_date: config?.jira?.start_date,
      end_date: config?.jira?.end_date
    });
    const outputPath = path.join(this.outputDir, outputFileName);
    
    // Strip embedded Python helpers to keep data-only output
    const helperMarker = 'def get_weekly_digest_data():';
    const markerIndex = pythonContent.indexOf(helperMarker);
    if (markerIndex !== -1) {
      pythonContent = pythonContent.slice(0, markerIndex);
    }
    fs.writeFileSync(outputPath, pythonContent);
    console.log(`\n✓ Generated weekly digest datasource: ${outputPath}`);
    
    // Print summary
    console.log('\nSummary:');
    console.log(`- Project: ${this.projectName}`);
    const jiraSourceLabel = usedSource === 'epic-tree' ? 'Epic tree included' : usedSource === 'team-report' ? 'Team report included' : usedSource === 'by-assignee' ? `${assigneeFiles.length} individual reports` : 'None';
    console.log(`- JIRA content: ${jiraSourceLabel}`);
    console.log(`- Daily reports: ${dailyReportFiles.length} files included`);
    console.log(`- Transcripts: ${transcriptFiles.length} files included`);
    console.log(`- Output file: ${outputFileName}`);
    // Token estimates (roughly 4 chars per token)
    function estimateTokens(charCount) { return Math.ceil((charCount || 0) / 4); }
    const jiraChars = jiraContent.length;
    const dailyChars = dailyReportContent.length;
    const transcriptChars = transcriptContent.length;
    const jiraTokens = estimateTokens(jiraChars);
    const dailyTokens = estimateTokens(dailyChars);
    const transcriptTokens = estimateTokens(transcriptChars);
    console.log('- Token estimates (approx):');
    console.log(`  JIRA_DATA: ${jiraChars} chars ≈ ${jiraTokens} tokens`);
    console.log(`  DAILY_REPORTS_DATA: ${dailyChars} chars ≈ ${dailyTokens} tokens`);
    console.log(`  TRANSCRIPT_DATA: ${transcriptChars} chars ≈ ${transcriptTokens} tokens`);
    console.log(`  Total: ≈ ${jiraTokens + dailyTokens + transcriptTokens} tokens`);
    
    return outputPath;
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      console.log('Starting weekly digest generation...\n');

      // Step 1: Run daily reports
      console.log('=== Step 1: Generating daily reports ===');
      await this.runCommand('npm', ['run', 'daily:all']);

      // Step 2: Generate JIRA team report (all board tickets)
      console.log('\n=== Step 2: Generating JIRA team report (all tickets) ===');
      await this.runCommand('npm', ['run', 'jira:team-all']);

      // Optional fallback: if team report was not produced, generate individual reports
      const maybeTeamReport = this.getTeamReportFile();
      if (!maybeTeamReport) {
        console.warn('\nTeam report not found, falling back to individual JIRA reports...');
        await this.runCommand('npm', ['run', 'jira:all']);
      }

      // Step 2.5: Build Epic Tree (weekly-only consolidation)
      console.log('\n=== Step 2.5: Building JIRA Epic Tree (weekly only) ===');
      await this.runCommand('npm', ['run', 'jira:epic-tree']);

      // Step 2.6: Append changelogs to Epic Tree
      console.log('\n=== Step 2.6: Appending changelogs to Epic Tree ===');
      await this.runCommand('node', ['jira/append-changelog-to-epic-tree.js']);

      // Step 3: Run transcripts:download
      console.log('\n=== Step 3: Downloading transcripts ===');
      await this.runCommand('npm', ['run', 'transcripts:download']);

      // Step 4: Generate the datasource file
      console.log('\n=== Step 4: Creating weekly digest datasource file ===');
      const outputPath = this.generateWeeklyDigest();

      // Step 5: Extract Jira data and upload to Vercel Blob
      console.log('\n=== Step 5: Upload to Vercel Blob (if enabled) ===');
      const vercelResults = await this.uploadToVercelBlob(outputPath);

      // Step 6: Store to Neon Database (if enabled)
      console.log('\n=== Step 6: Store to Neon Database (if enabled) ===');
      await this.storeToNeonDB(outputPath, vercelResults);

      console.log('\n✓ Weekly digest generation completed successfully!');
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-weekly-digest',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }

  /**
   * Upload markdown outputs and extracted Jira data to Vercel Blob
   */
  async uploadToVercelBlob(datasourcePath) {
    try {
      const { uploadAllData } = require('../lib/vercel-blob-uploader');
      const { extractAndSave } = require('../lib/jira-data-extractor');
      const { getProjectFolder } = require('../lib/project-folder');
      
      const projectFolder = getProjectFolder(process.env.TEAM, config);
      
      // Extract Jira data from datasource.py
      const jiraDataFile = extractAndSave(
        datasourcePath,
        this.jiraDir,
        config,
        'weekly'
      );
      
      // Upload all data
      const results = await uploadAllData({
        projectFolder,
        config,
        transcriptsDir: this.transcriptsDir,
        dailyReportsDir: this.dailyReportsDir,
        slackDir: this.slackDir,
        jiraDataFile
      });
      
      return results;
    } catch (error) {
      console.warn('⚠ Vercel Blob upload failed (non-fatal):', error.message);
      console.warn('Continuing without upload...');
      return null;
    }
  }

  /**
   * Store data to Neon Database
   */
  async storeToNeonDB(datasourcePath, vercelResults) {
    try {
      const { storeAllData } = require('../lib/neon-db-storage');
      const { getProjectFolder } = require('../lib/project-folder');
      const { extractAndSave } = require('../lib/jira-data-extractor');
      
      const projectFolder = getProjectFolder(process.env.TEAM, config);
      
      // Extract Jira data file path (should already be extracted from uploadToVercelBlob)
      const jiraDataFile = extractAndSave(
        datasourcePath,
        this.jiraDir,
        config,
        'weekly'
      );
      
      // Store all data
      await storeAllData({
        projectFolder,
        config,
        transcriptsDir: this.transcriptsDir,
        dailyReportsDir: this.dailyReportsDir,
        slackDir: this.slackDir,
        jiraDataFile,
        vercelResults
      });
    } catch (error) {
      console.warn('⚠ Neon DB storage failed (non-fatal):', error.message);
      console.warn('Continuing without database storage...');
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new WeeklyDigestGenerator();
  generator.run();
}

module.exports = WeeklyDigestGenerator;
