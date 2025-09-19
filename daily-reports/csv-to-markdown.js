const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class DailyReportMarkdownConverter {
  constructor() {
    this.outputDir = path.join(__dirname, 'md-output');
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async convertCsvToMarkdown(csvFilePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(csvFilePath)
        .pipe(csv({
          mapHeaders: ({ header }) => header ? header.replace(/^\uFEFF/, '').trim() : header
        }))
        .on('data', (data) => {
          // Clean the data
          const cleanedData = {};
          Object.keys(data).forEach((key) => {
            const cleanKey = key.trim();
            const value = data[key];
            if (value !== null && value !== undefined && value !== '') {
              cleanedData[cleanKey] = typeof value === 'string' ? value.trim() : value;
            }
          });
          if (Object.keys(cleanedData).length > 0) {
            results.push(cleanedData);
          }
        })
        .on('end', () => {
          const markdown = this.generateMarkdown(results);
          resolve(markdown);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  generateMarkdown(data) {
    if (!data || data.length === 0) {
      return '# Daily Reports\n\nNo daily report data available.';
    }

    // Helper to normalize keys
    const normalizeKey = (key) => key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const getField = (row, desired, fallbackAliases = []) => {
      const desiredNorm = normalizeKey(desired);
      const aliases = [desired, ...fallbackAliases];
      
      // Try exact match first
      if (row[desired] && String(row[desired]).trim() !== '') return String(row[desired]);
      
      // Try normalized key match
      const rowKeys = Object.keys(row);
      for (const k of rowKeys) {
        if (normalizeKey(k) === desiredNorm && String(row[k]).trim() !== '') {
          return String(row[k]);
        }
      }
      
      // Try aliases
      for (const alias of aliases) {
        const aliasNorm = normalizeKey(alias);
        for (const k of rowKeys) {
          if (normalizeKey(k) === aliasNorm && String(row[k]).trim() !== '') {
            return String(row[k]);
          }
        }
      }
      return '';
    };

    // Group rows by report_date
    const grouped = {};
    for (const row of data) {
      const dateRaw = getField(row, 'report_date', ['date', 'report date', 'report-date']);
      const key = (dateRaw || '').trim();
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    // Sort dates ascending
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      const da = this.parseDate(a);
      const db = this.parseDate(b);
      return da.getTime() - db.getTime();
    });

    // Get employee info from first row
    const first = data[0] || {};
    const employeeName = this.buildEmployeeName(
      getField(first, 'employee_first_name', ['first_name', 'employee first name']),
      getField(first, 'employee_last_name', ['last_name', 'employee last name'])
    );

    // Build markdown
    let markdown = '# Daily Reports\n\n';
    if (employeeName) markdown += `**Employee**: ${employeeName}  \n`;
    
    const projectName = getField(first, 'client_project_name', ['project_name', 'client project name']);
    const templateName = getField(first, 'report_template_name', ['template_name', 'report template name']);
    
    if (projectName) markdown += `**Project**: ${projectName}  \n`;
    if (templateName) markdown += `**Template**: ${templateName}  \n`;
    markdown += `**Generated**: ${new Date().toLocaleString()}\n\n`;

    // Process each date
    for (const dateKey of sortedDates) {
      const rowsForDate = grouped[dateKey];
      const niceDate = this.formatDate(dateKey);
      markdown += `## ${niceDate}\n\n`;

      const multiple = (rowsForDate?.length || 0) > 1;
      
      if (!rowsForDate || rowsForDate.length === 0) {
        markdown += `*(No entries)*\n\n`;
        continue;
      }

      for (const row of rowsForDate) {
        const name = this.buildEmployeeName(
          getField(row, 'employee_first_name', ['first_name', 'employee first name']),
          getField(row, 'employee_last_name', ['last_name', 'employee last name'])
        );
        const project = getField(row, 'client_project_name', ['project_name', 'client project name']).trim();
        
        if (multiple) {
          const labelParts = [];
          if (name) labelParts.push(name);
          if (project) labelParts.push(project);
          if (labelParts.length > 0) markdown += `### ${labelParts.join(' — ')}\n\n`;
        } else {
          const context = [];
          if (name) context.push(`**Employee**: ${name}`);
          if (project) context.push(`**Project**: ${project}`);
          if (context.length > 0) markdown += `${context.join('  \n')}\n\n`;
        }

        // Tasks Done
        const content = getField(row, 'content') || '';
        const tasksDoneLines = this.htmlToBulletLines(content);
        markdown += `### Tasks Done\n\n`;
        if (tasksDoneLines.length === 0) {
          const fallback = this.htmlToPlainText(content).trim();
          markdown += `${fallback ? `- ${fallback}` : '- (none)'}\n\n`;
        } else {
          for (const line of tasksDoneLines) markdown += `- ${line}\n`;
          markdown += '\n';
        }

        // To Do
        const todo = getField(row, 'todo') || '';
        const todoLines = this.htmlToBulletLines(todo);
        markdown += `### To Do\n\n`;
        if (todoLines.length === 0) {
          const fallback = this.htmlToPlainText(todo).trim();
          markdown += `${fallback ? `- ${fallback}` : '- (none)'}\n\n`;
        } else {
          for (const line of todoLines) markdown += `- ${line}\n`;
          markdown += '\n';
        }

        // Other details
        const meta = [];
        const template = getField(row, 'report_template_name', ['template_name']);
        const projectId = getField(row, 'client_project_id', ['project_id']);
        const employeeId = getField(row, 'employee_id', ['id']);
        
        if (template) meta.push(`Template: ${template}`);
        if (projectId) meta.push(`Project ID: ${projectId}`);
        if (employeeId) meta.push(`Employee ID: ${employeeId}`);
        
        if (meta.length > 0) {
          markdown += `### Details\n\n`;
          for (const m of meta) markdown += `- ${m}\n`;
          markdown += '\n';
        }
      }

      markdown += '\n';
    }

    return markdown.trim() + '\n';
  }

  buildEmployeeName(first, last) {
    const f = (first || '').trim();
    const l = (last || '').trim();
    return [f, l].filter(Boolean).join(' ');
  }

  parseDate(dateValue) {
    // Expecting YYYY-MM-DD format
    if (dateValue && /\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      const parts = dateValue.split('-');
      const year = parseInt(parts[0] || '1970', 10);
      const month = parseInt(parts[1] || '1', 10);
      const day = parseInt(parts[2] || '1', 10);
      return new Date(year, month - 1, day);
    }
    const d = new Date(dateValue);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }

  formatDate(dateValue) {
    const d = this.parseDate(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  htmlToBulletLines(html) {
    if (!html || html.trim() === '') return [];

    // Extract list items
    const items = [];
    const regex = /<li[\s\S]*?>([\s\S]*?)<\/li>/gi;
    let match;
    
    while ((match = regex.exec(html))) {
      const raw = (match[1] || '').trim();
      if (!raw) continue;
      
      let text = raw;
      // Remove wrapping <p> tags
      text = text.replace(/^\s*<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '');
      text = this.htmlInlineToMarkdown(text);
      text = this.stripHtmlTags(text);
      text = this.decodeEntities(text);
      text = text.replace(/\s+/g, ' ').trim();
      
      if (text) items.push(text);
    }

    return items;
  }

  htmlToPlainText(html) {
    if (!html) return '';
    let text = this.htmlInlineToMarkdown(html);
    text = this.stripHtmlTags(text);
    text = this.decodeEntities(text);
    return text.replace(/\s+/g, ' ').trim();
  }

  htmlInlineToMarkdown(input) {
    if (!input) return '';
    let out = input;
    // Bold/strong
    out = out.replace(/<\s*(b|strong)\s*>/gi, '**').replace(/<\s*\/\s*(b|strong)\s*>/gi, '**');
    // Italic/em
    out = out.replace(/<\s*(i|em)\s*>/gi, '*').replace(/<\s*\/\s*(i|em)\s*>/gi, '*');
    // Code
    out = out.replace(/<\s*code\s*>/gi, '`').replace(/<\s*\/\s*code\s*>/gi, '`');
    // Line breaks
    out = out.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    return out;
  }

  stripHtmlTags(input) {
    if (!input) return '';
    return input.replace(/<[^>]+>/g, '');
  }

  decodeEntities(input) {
    if (!input) return '';
    const map = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' '
    };
    return input.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => map[m] || m);
  }
}

// Main execution
async function main() {
  const converter = new DailyReportMarkdownConverter();
  converter.ensureOutputDir();

  // Look for CSV files in the data directory
  const dataDir = path.join(__dirname, 'data');
  
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory not found. Please run the database query first.');
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.csv'));
  
  if (csvFiles.length === 0) {
    console.error('No CSV files found in the data directory.');
    process.exit(1);
  }

  // Process all CSV files
  console.log(`Found ${csvFiles.length} CSV file(s) to process\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const csvFile of csvFiles.sort()) {
    const csvPath = path.join(dataDir, csvFile);
    
    console.log(`Processing: ${csvFile}`);
    
    try {
      const markdown = await converter.convertCsvToMarkdown(csvPath);
      
      // Generate output filename based on input
      const baseName = path.basename(csvFile, '.csv');
      const outputFileName = `${baseName}.md`;
      const outputPath = path.join(converter.outputDir, outputFileName);
      
      // Write markdown file
      fs.writeFileSync(outputPath, markdown);
      
      console.log(`  ✓ Created: ${outputFileName} (${fs.statSync(outputPath).size} bytes)`);
      successCount++;
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\nConversion complete:`);
  console.log(`  ✓ Success: ${successCount} file(s)`);
  if (errorCount > 0) {
    console.log(`  ✗ Failed: ${errorCount} file(s)`);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = DailyReportMarkdownConverter;
