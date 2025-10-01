/**
 * Test script for filename date extraction
 * Tests the robust date parsing from various filename formats
 */

// Inline the date extraction function for testing
function extractDateFromFilename(filename) {
  const nameWithoutExt = filename.replace(/\.(txt|md)$/i, '');
  
  // Supports separators: - _ / (hyphen, underscore, slash)
  const patterns = [
    // YYYY-MM-DD or YYYY_MM_DD or YYYY/MM/DD (2025-09-24, 2025_09_24, 2025/09/24)
    {
      regex: /(\d{4})[-_/](\d{2})[-_/](\d{2})/,
      parser: (match) => {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        return new Date(year, month, day);
      }
    },
    // MM-DD-YYYY or MM_DD_YYYY or MM/DD/YYYY (09-24-2025, 09_24_2025, 09/24/2025) - Must come before MM-DD-YY!
    {
      regex: /(\d{2})[-_/](\d{2})[-_/](\d{4})/,
      parser: (match) => {
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        return new Date(year, month, day);
      }
    },
    // MM-DD-YY or MM_DD_YY or MM/DD/YY (09-24-25, 09_24_25, 09/24/25) - Less specific, check last
    {
      regex: /(\d{2})[-_/](\d{2})[-_/](\d{2})/,
      parser: (match) => {
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      }
    }
  ];
  
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern.regex);
    if (match) {
      try {
        const date = pattern.parser(match);
        if (date && !isNaN(date.getTime())) {
          const year = date.getFullYear();
          if (year >= 2020 && year <= 2030) {
            return date;
          }
        }
      } catch (err) {
        continue;
      }
    }
  }
  
  return null;
}

// Test cases
const testCases = [
  // Format: [filename, expectedDate (YYYY-MM-DD)]
  ['fathom_AICoach-09_30_25 09_14AM.txt', '2025-09-30'],
  ['fathom_AICoach-09_24_25 04_49AM-AICoachTestCall.txt', '2025-09-24'],
  ['fathom_AICoach-09_15_25 09_51AM.txt', '2025-09-15'],
  ['fathom_AICoach-09/24/25 08:44AM-EngPathDeploymentCall.txt', '2025-09-24'], // ✨ Slash format from Google Drive
  ['transcript-2025-09-24.txt', '2025-09-24'],
  ['meeting_2025_09_15.txt', '2025-09-15'],
  ['meeting_2025/09/15.txt', '2025-09-15'], // ✨ Slash format
  ['fathom-09-24-25.txt', '2025-09-24'],
  ['call_09_24_2025.txt', '2025-09-24'],
  ['call_09/24/2025.txt', '2025-09-24'], // ✨ Slash format with 4-digit year
  ['meeting-12-31-23.txt', '2023-12-31'],
  ['transcript-01-01-24.txt', '2024-01-01'],
  ['no_date_in_this_file.txt', null],
  ['meeting_with_time_only_10_30AM.txt', null],
];

console.log('Testing filename date extraction...\n');

let passed = 0;
let failed = 0;

testCases.forEach(([filename, expectedDateStr]) => {
  const extractedDate = extractDateFromFilename(filename);
  
  // Compare dates by components to avoid timezone issues
  let isMatch = false;
  let extractedStr = 'null';
  let expectedStr = expectedDateStr || 'null';
  
  if (expectedDateStr && extractedDate) {
    const [expYear, expMonth, expDay] = expectedDateStr.split('-').map(Number);
    const actYear = extractedDate.getFullYear();
    const actMonth = extractedDate.getMonth() + 1; // Convert back to 1-indexed
    const actDay = extractedDate.getDate();
    
    extractedStr = `${actYear}-${String(actMonth).padStart(2, '0')}-${String(actDay).padStart(2, '0')}`;
    isMatch = (actYear === expYear && actMonth === expMonth && actDay === expDay);
  } else if (!expectedDateStr && !extractedDate) {
    isMatch = true;
  }
  
  if (isMatch) {
    console.log(`✓ ${filename}`);
    console.log(`  Extracted: ${extractedStr}`);
    passed++;
  } else {
    console.log(`✗ ${filename}`);
    console.log(`  Expected: ${expectedStr}`);
    console.log(`  Got: ${extractedStr}`);
    failed++;
  }
  console.log('');
});

console.log('==================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('==================================================');

if (failed > 0) {
  process.exit(1);
}

