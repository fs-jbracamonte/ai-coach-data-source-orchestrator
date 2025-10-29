/**
 * Unit tests for date-range-filter.js utilities
 */

const assert = require('assert');
const {
  parseIsoDate,
  isWithinRange,
  parseTranscriptDateFromFilename,
  parseDateFromHeading,
  trimDailyMarkdownToRange
} = require('../datasource-generator/lib/date-range-filter');

describe('Date Range Filter Utilities', () => {
  
  describe('parseIsoDate', () => {
    it('should parse valid ISO dates', () => {
      assert.strictEqual(parseIsoDate('2025-10-13'), '2025-10-13');
      assert.strictEqual(parseIsoDate('2025-01-01'), '2025-01-01');
      assert.strictEqual(parseIsoDate('2025-12-31'), '2025-12-31');
    });

    it('should handle dates with time components', () => {
      assert.strictEqual(parseIsoDate('2025-10-13T07:16:03'), '2025-10-13');
      assert.strictEqual(parseIsoDate('2025-10-13T00:00:00Z'), '2025-10-13');
    });

    it('should return null for invalid dates', () => {
      assert.strictEqual(parseIsoDate('2025-02-30'), null); // Invalid day
      assert.strictEqual(parseIsoDate('2025-13-01'), null); // Invalid month
      assert.strictEqual(parseIsoDate('not-a-date'), null);
      assert.strictEqual(parseIsoDate(''), null);
      assert.strictEqual(parseIsoDate(null), null);
    });
  });

  describe('isWithinRange', () => {
    it('should return true for dates within range', () => {
      assert.strictEqual(isWithinRange('2025-10-13', '2025-10-01', '2025-10-31'), true);
      assert.strictEqual(isWithinRange('2025-10-01', '2025-10-01', '2025-10-31'), true); // Start boundary
      assert.strictEqual(isWithinRange('2025-10-31', '2025-10-01', '2025-10-31'), true); // End boundary
    });

    it('should return false for dates outside range', () => {
      assert.strictEqual(isWithinRange('2025-09-30', '2025-10-01', '2025-10-31'), false); // Before
      assert.strictEqual(isWithinRange('2025-11-01', '2025-10-01', '2025-10-31'), false); // After
    });

    it('should handle invalid inputs', () => {
      assert.strictEqual(isWithinRange('invalid', '2025-10-01', '2025-10-31'), false);
      assert.strictEqual(isWithinRange('2025-10-15', 'invalid', '2025-10-31'), false);
      assert.strictEqual(isWithinRange('2025-10-15', '2025-10-01', 'invalid'), false);
    });
  });

  describe('parseTranscriptDateFromFilename', () => {
    it('should extract date from Fathom transcript filenames', () => {
      assert.strictEqual(
        parseTranscriptDateFromFilename('fathom-transcripts-2025-10-13T07_16_03+00_00.md'),
        '2025-10-13'
      );
      assert.strictEqual(
        parseTranscriptDateFromFilename('fathom-transcripts-2025-01-01T00_00_00+00_00.md'),
        '2025-01-01'
      );
    });

    it('should handle files in subdirectories', () => {
      assert.strictEqual(
        parseTranscriptDateFromFilename('subfolder/fathom-transcripts-2025-10-13T07_16_03+00_00.md'),
        '2025-10-13'
      );
      assert.strictEqual(
        parseTranscriptDateFromFilename('team-a\\fathom-transcripts-2025-10-13T07_16_03+00_00.md'),
        '2025-10-13'
      );
    });

    it('should return null for filenames without dates', () => {
      assert.strictEqual(parseTranscriptDateFromFilename('transcript.md'), null);
      assert.strictEqual(parseTranscriptDateFromFilename('meeting-notes.md'), null);
      assert.strictEqual(parseTranscriptDateFromFilename(''), null);
    });

    it('should return null for invalid dates in filenames', () => {
      assert.strictEqual(parseTranscriptDateFromFilename('fathom-transcripts-2025-13-01T00_00_00.md'), null);
      assert.strictEqual(parseTranscriptDateFromFilename('fathom-transcripts-2025-02-30T00_00_00.md'), null);
    });

    it('should extract date from MM_DD_YYYY style filenames', () => {
      assert.strictEqual(
        parseTranscriptDateFromFilename('fathom_AICoach-10_14_2025 09_26AM.md'),
        '2025-10-14'
      );
      assert.strictEqual(
        parseTranscriptDateFromFilename('folder/sub/fathom-9-8-2024_notes.md'),
        '2024-09-08'
      );
    });

    it('should extract date from MM_DD_YY style filenames', () => {
      assert.strictEqual(
        parseTranscriptDateFromFilename('fathom_AICoach-10_14_25 09_26AM.md'),
        '2025-10-14'
      );
      assert.strictEqual(
        parseTranscriptDateFromFilename('meeting-1_2_01-summary.md'),
        '2001-01-02'
      );
      assert.strictEqual(
        parseTranscriptDateFromFilename('meeting-12_31_99-summary.md'),
        '1999-12-31'
      );
    });
  });

  describe('parseDateFromHeading', () => {
    it('should parse ISO format headings', () => {
      assert.strictEqual(parseDateFromHeading('## 2025-10-13'), '2025-10-13');
      assert.strictEqual(parseDateFromHeading('## 2025-01-01'), '2025-01-01');
      assert.strictEqual(parseDateFromHeading('##2025-12-31'), '2025-12-31'); // No space
    });

    it('should parse long format headings', () => {
      assert.strictEqual(parseDateFromHeading('## October 13, 2025'), '2025-10-13');
      assert.strictEqual(parseDateFromHeading('## January 1, 2025'), '2025-01-01');
      assert.strictEqual(parseDateFromHeading('## December 31, 2025'), '2025-12-31');
      assert.strictEqual(parseDateFromHeading('## October 13 2025'), '2025-10-13'); // No comma
    });

    it('should be case-insensitive for month names', () => {
      assert.strictEqual(parseDateFromHeading('## OCTOBER 13, 2025'), '2025-10-13');
      assert.strictEqual(parseDateFromHeading('## october 13, 2025'), '2025-10-13');
    });

    it('should pad single-digit days', () => {
      assert.strictEqual(parseDateFromHeading('## October 1, 2025'), '2025-10-01');
      assert.strictEqual(parseDateFromHeading('## October 9, 2025'), '2025-10-09');
    });

    it('should return null for invalid headings', () => {
      assert.strictEqual(parseDateFromHeading('# Not a date'), null);
      assert.strictEqual(parseDateFromHeading('## InvalidMonth 13, 2025'), null);
      assert.strictEqual(parseDateFromHeading('Regular text'), null);
      assert.strictEqual(parseDateFromHeading(''), null);
    });
  });

  describe('trimDailyMarkdownToRange', () => {
    const sampleMarkdown = `# Daily Reports

**Employee**: John Doe
**Project**: Test Project

## October 12, 2025

### Tasks Done

- Task 1 on Oct 12
- Task 2 on Oct 12

## October 13, 2025

### Tasks Done

- Task 1 on Oct 13
- Task 2 on Oct 13

## October 14, 2025

### Tasks Done

- Task 1 on Oct 14
- Task 2 on Oct 14

## October 15, 2025

### Tasks Done

- Task 1 on Oct 15`;

    it('should trim to include only dates within range', () => {
      const result = trimDailyMarkdownToRange(sampleMarkdown, '2025-10-13', '2025-10-14');
      
      // Should include header
      assert(result.includes('# Daily Reports'));
      assert(result.includes('**Employee**: John Doe'));
      
      // Should include Oct 13 and Oct 14
      assert(result.includes('## October 13, 2025'));
      assert(result.includes('Task 1 on Oct 13'));
      assert(result.includes('## October 14, 2025'));
      assert(result.includes('Task 1 on Oct 14'));
      
      // Should NOT include Oct 12 and Oct 15
      assert(!result.includes('## October 12, 2025'));
      assert(!result.includes('Task 1 on Oct 12'));
      assert(!result.includes('## October 15, 2025'));
      assert(!result.includes('Task 1 on Oct 15'));
    });

    it('should work with ISO format dates in markdown', () => {
      const isoMarkdown = `# Daily Reports

**Employee**: Jane Smith

## 2025-10-12

- Task 1

## 2025-10-13

- Task 2

## 2025-10-14

- Task 3`;

      const result = trimDailyMarkdownToRange(isoMarkdown, '2025-10-13', '2025-10-13');
      
      assert(result.includes('## 2025-10-13'));
      assert(result.includes('- Task 2'));
      assert(!result.includes('## 2025-10-12'));
      assert(!result.includes('## 2025-10-14'));
    });

    it('should return empty string if no dates are in range', () => {
      const result = trimDailyMarkdownToRange(sampleMarkdown, '2025-11-01', '2025-11-30');
      assert.strictEqual(result, '');
    });

    it('should preserve header and single date section', () => {
      const result = trimDailyMarkdownToRange(sampleMarkdown, '2025-10-13', '2025-10-13');
      
      assert(result.includes('# Daily Reports'));
      assert(result.includes('**Employee**: John Doe'));
      assert(result.includes('## October 13, 2025'));
      assert(result.includes('Task 1 on Oct 13'));
    });

    it('should return original content if no date range specified', () => {
      const result = trimDailyMarkdownToRange(sampleMarkdown, '', '');
      assert.strictEqual(result, sampleMarkdown);
    });

    it('should handle empty or null inputs', () => {
      assert.strictEqual(trimDailyMarkdownToRange('', '2025-10-01', '2025-10-31'), '');
      assert.strictEqual(trimDailyMarkdownToRange(null, '2025-10-01', '2025-10-31'), '');
    });

    it('should handle markdown with mixed date formats', () => {
      const mixedMarkdown = `# Daily Reports

**Employee**: Mixed Format

## October 12, 2025

- Long format task

## 2025-10-13

- ISO format task

## October 14, 2025

- Another long format task`;

      const result = trimDailyMarkdownToRange(mixedMarkdown, '2025-10-13', '2025-10-13');
      
      assert(result.includes('## 2025-10-13'));
      assert(result.includes('- ISO format task'));
      assert(!result.includes('## October 12, 2025'));
      assert(!result.includes('## October 14, 2025'));
    });
  });
});




