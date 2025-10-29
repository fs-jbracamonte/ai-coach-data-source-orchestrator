/**
 * Date range filtering utilities for datasource generation
 * 
 * Provides functions to:
 * - Parse and validate ISO dates
 * - Check if dates fall within ranges
 * - Extract dates from transcript filenames
 * - Trim daily report markdown to date ranges
 */

/**
 * Parse and validate an ISO date string (YYYY-MM-DD)
 * @param {string} s - Date string to parse
 * @returns {string|null} - Normalized YYYY-MM-DD string or null if invalid
 */
function parseIsoDate(s) {
  if (!s || typeof s !== 'string') return null;
  
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  
  // Validate the date is real (handles invalid dates like 2025-02-30)
  if (isNaN(date.getTime())) return null;
  
  // Check if the date components match (catches invalid dates that JS silently corrects)
  if (date.getUTCFullYear() !== parseInt(year, 10) ||
      date.getUTCMonth() + 1 !== parseInt(month, 10) ||
      date.getUTCDate() !== parseInt(day, 10)) {
    return null;
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string falls within a range (inclusive)
 * @param {string} dateStr - Date to check (YYYY-MM-DD)
 * @param {string} start - Range start (YYYY-MM-DD)
 * @param {string} end - Range end (YYYY-MM-DD)
 * @returns {boolean} - True if date is within range (inclusive)
 */
function isWithinRange(dateStr, start, end) {
  const date = parseIsoDate(dateStr);
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  
  if (!date || !startDate || !endDate) return false;
  
  return date >= startDate && date <= endDate;
}

/**
 * Extract date from transcript filename
 * Expects format: fathom-transcripts-YYYY-MM-DDTHH_MM_SS+00_00.md
 * @param {string} filename - Transcript filename (may include subdirectory path)
 * @returns {string|null} - Extracted date (YYYY-MM-DD) or null
 */
function parseTranscriptDateFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  
  // Extract basename if path includes subdirectories
  const basename = filename.split('/').pop().split('\\').pop();

  // 1) Prefer ISO-like pattern in Fathom export: YYYY-MM-DDTHH_mm_ss...
  let m = basename.match(/(\d{4}-\d{2}-\d{2})T/);
  if (m) return parseIsoDate(m[1]);

  // 1a) Common sanitized formats using underscores or hyphens: MM_DD_YYYY or MM-DD-YYYY
  m = basename.match(/(\d{1,2})[_-](\d{1,2})[_-](\d{4})/);
  if (m) {
    const month = String(parseInt(m[1], 10)).padStart(2, '0');
    const day = String(parseInt(m[2], 10)).padStart(2, '0');
    const year = String(parseInt(m[3], 10));
    return parseIsoDate(`${year}-${month}-${day}`);
  }

  // 1b) Underscore or hyphen with two-digit year: MM_DD_YY or MM-DD-YY (e.g., timeclock10_20_25 ...)
  m = basename.match(/(\d{1,2})[_-](\d{1,2})[_-](\d{2})(?!\d)/);
  if (m) {
    const monthNum = parseInt(m[1], 10);
    const dayNum = parseInt(m[2], 10);
    let yearNum = parseInt(m[3], 10);
    if (yearNum <= 50) yearNum += 2000; else yearNum += 1900;
    const month = String(monthNum).padStart(2, '0');
    const day = String(dayNum).padStart(2, '0');
    const year = String(yearNum);
    return parseIsoDate(`${year}-${month}-${day}`);
  }

  // Normalize separators to simplify alternate matches
  const normalized = basename.replace(/[\-_.]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 2) Match MM DD YYYY (accept 1-2 digit month/day)
  m = normalized.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/);
  if (m) {
    const month = String(parseInt(m[1], 10)).padStart(2, '0');
    const day = String(parseInt(m[2], 10)).padStart(2, '0');
    const year = String(parseInt(m[3], 10));
    return parseIsoDate(`${year}-${month}-${day}`);
  }

  // 3) Match MM DD YY (two-digit year). Heuristic: 00-50 => 2000-2050; 51-99 => 1951-1999
  m = normalized.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2})\b/);
  if (m) {
    const monthNum = parseInt(m[1], 10);
    const dayNum = parseInt(m[2], 10);
    let yearNum = parseInt(m[3], 10);
    if (yearNum <= 50) yearNum += 2000; else yearNum += 1900;
    const month = String(monthNum).padStart(2, '0');
    const day = String(dayNum).padStart(2, '0');
    const year = String(yearNum);
    return parseIsoDate(`${year}-${month}-${day}`);
  }

  // 4) Match MonthName DD, YYYY (e.g., October 14, 2025) if present in filename
  m = normalized.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) {
    const monthNames = {
      january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };
    const month = monthNames[String(m[1]).toLowerCase()];
    const day = String(parseInt(m[2], 10)).padStart(2, '0');
    const year = String(parseInt(m[3], 10));
    if (month) return parseIsoDate(`${year}-${month}-${day}`);
  }

  // No recognizable date component
  return null;
}

/**
 * Parse date from markdown heading
 * Supports both formats:
 * - ## October 13, 2025
 * - ## 2025-10-13
 * @param {string} heading - Heading line
 * @returns {string|null} - ISO date (YYYY-MM-DD) or null
 */
function parseDateFromHeading(heading) {
  if (!heading || typeof heading !== 'string') return null;
  
  // Try ISO format first: ## 2025-10-13
  const isoMatch = heading.match(/##\s*(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return parseIsoDate(isoMatch[1]);
  }
  
  // Try long format: ## October 13, 2025
  const monthNames = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };
  
  const longMatch = heading.match(/##\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (longMatch) {
    const [, monthName, day, year] = longMatch;
    const month = monthNames[monthName.toLowerCase()];
    if (month) {
      const paddedDay = day.padStart(2, '0');
      return parseIsoDate(`${year}-${month}-${paddedDay}`);
    }
  }
  
  return null;
}

/**
 * Trim daily report markdown to include only sections within date range
 * Preserves header block and filters date-based sections
 * @param {string} markdown - Full daily report markdown content
 * @param {string} start - Start date (YYYY-MM-DD)
 * @param {string} end - End date (YYYY-MM-DD)
 * @returns {string} - Trimmed markdown or empty string if no in-range content
 */
function trimDailyMarkdownToRange(markdown, start, end) {
  if (!markdown || typeof markdown !== 'string') return '';
  if (!start || !end) return markdown; // No range specified, return as-is
  
  const lines = markdown.split('\n');
  const result = [];
  
  // Track header block (everything before first ## date heading)
  let inHeader = true;
  let currentSection = [];
  let currentSectionDate = null;
  let foundAnyInRange = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is a date heading
    const dateMatch = parseDateFromHeading(line);
    
    if (dateMatch) {
      // We've left the header
      inHeader = false;
      
      // Save previous section if it was in range
      if (currentSectionDate && isWithinRange(currentSectionDate, start, end)) {
        result.push(...currentSection);
        foundAnyInRange = true;
      }
      
      // Start new section
      currentSection = [line];
      currentSectionDate = dateMatch;
    } else {
      if (inHeader) {
        // Still in header, always include
        result.push(line);
      } else {
        // In a date section, accumulate
        currentSection.push(line);
      }
    }
  }
  
  // Don't forget the last section
  if (currentSectionDate && isWithinRange(currentSectionDate, start, end)) {
    result.push(...currentSection);
    foundAnyInRange = true;
  }
  
  // If no in-range sections found, return empty
  if (!foundAnyInRange) return '';
  
  return result.join('\n');
}

module.exports = {
  parseIsoDate,
  isWithinRange,
  parseTranscriptDateFromFilename,
  parseDateFromHeading,
  trimDailyMarkdownToRange
};

