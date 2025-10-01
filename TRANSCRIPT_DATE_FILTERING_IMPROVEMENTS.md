# Transcript Date Filtering Improvements

## Overview
Enhanced the transcript download module to use robust filename-based date extraction instead of relying solely on file modified dates. This solves the problem where users modify transcript files (e.g., re-downloading or editing), which changes the modified date and breaks date range filtering.

## Problem Statement
**Original Issue**: File modified dates are unreliable for filtering because:
- Users may re-download transcript files
- Files may be edited or modified after creation
- The actual meeting date is in the filename, not the file metadata

**Solution**: Extract dates directly from filenames using multiple format parsers, with fallback to modified date when no date is found in the filename.

## Changes Made

### 1. Enhanced Date Extraction (`transcripts/download-from-drive.js`)

#### New Function: `extractDateFromFilename(filename)`
Parses dates from filenames using multiple regex patterns:

**Supported Formats** (in priority order):
1. **YYYY-MM-DD** or **YYYY_MM_DD** (e.g., `2025-09-24`, `2025_09_24`)
2. **MM-DD-YYYY** or **MM_DD_YYYY** (e.g., `09-24-2025`, `09_24_2025`) ⚠️ Must check before 2-digit year
3. **MM-DD-YY** or **MM_DD_YY** (e.g., `09-24-25`, `09_24_25`) - Assumes 2000s (25 → 2025)

**Pattern Order is Critical**:
- More specific patterns (4-digit year) must be checked first
- Otherwise `09_24_2025` would match as `09_24_20` (year 2020) instead of full year 2025

**Date Validation**:
- Checks for valid date objects (not NaN)
- Enforces reasonable year range: 2020-2030
- Returns `null` if no valid date found

**Examples**:
```javascript
extractDateFromFilename('fathom_AICoach-09_30_25 09_14AM.txt')
// Returns: Date(2025, 8, 30) = September 30, 2025

extractDateFromFilename('meeting-2025-09-24.txt')
// Returns: Date(2025, 8, 24) = September 24, 2025

extractDateFromFilename('transcript-09_24_2025.txt')
// Returns: Date(2025, 8, 24) = September 24, 2025

extractDateFromFilename('no_date_here.txt')
// Returns: null (falls back to modified date)
```

#### Updated Function: `isWithinDateRange(filename, modifiedTime, startDate, endDate)`
**Priority Logic**:
1. **First**: Try to extract date from filename using `extractDateFromFilename()`
2. **Fallback**: Use file's `modifiedTime` if no date found in filename
3. **Compare**: Check if date falls within configured date range

**Benefits**:
- More reliable - uses actual meeting date from filename
- Immune to file modifications
- Still works for files without dates in filename (uses modified date)

### 2. Enhanced Prefix Filtering

Changed from exact-start match to flexible substring match:

**Before**:
```javascript
file.name.startsWith(prefix)  // Case-sensitive, must be at start
```

**After**:
```javascript
file.name.toLowerCase().includes(prefixLower)  // Case-insensitive, anywhere in name
```

**Benefits**:
- Files like `fathom_AICoach-09_30_25.txt` now match prefix `"fathom"`
- Previously only `fathom-transcript...` would match
- Case-insensitive: `Fathom`, `FATHOM`, `fathom` all work

### 3. Updated Configuration Files

**config.json** & **config.ai-coach.json**:
```json
"filePrefix": "fathom"  // Changed from "fathom-transcript"
```

**config.example.jsonc**:
```jsonc
"filePrefix": "fathom",  // File name filter (case-insensitive, matches anywhere in filename; "" downloads all files)
```

### 4. Comprehensive Test Suite

**New File**: `test/test-date-extraction.js`

**Test Coverage** (11 test cases):
- ✅ MM_DD_YY format with time suffix (`fathom_AICoach-09_30_25 09_14AM.txt`)
- ✅ MM_DD_YY with meeting name (`fathom_AICoach-09_24_25 04_49AM-AICoachTestCall.txt`)
- ✅ YYYY-MM-DD format (`transcript-2025-09-24.txt`)
- ✅ YYYY_MM_DD format (`meeting_2025_09_15.txt`)
- ✅ MM-DD-YY format (`fathom-09-24-25.txt`)
- ✅ MM_DD_YYYY format (`call_09_24_2025.txt`) - **Critical test for pattern order**
- ✅ Historical dates (`meeting-12-31-23.txt` → 2023)
- ✅ Recent dates (`transcript-01-01-24.txt` → 2024)
- ✅ No date in filename (returns `null`)
- ✅ Time only without date (returns `null`)

**Run Test**:
```bash
npm run test:date-extraction
```

**Added to Main Test Suite**:
```bash
npm test  # Now includes date extraction tests
```

## Results

### Before Enhancement:
- ❌ Only found 0 transcripts (date filter failed due to modified dates)
- ❌ Prefix `"fathom-transcript"` missed files named `fathom_AICoach-*`
- ❌ Re-downloading files broke date filtering

### After Enhancement:
- ✅ Found 23 transcripts correctly filtered by date
- ✅ Dates extracted from filenames like `09_30_25`, `09_24_25`, etc.
- ✅ All dates correctly parsed and validated against range (2025-09-01 to 2025-09-30)
- ✅ Works even when files are modified or re-downloaded
- ✅ Flexible prefix matching finds all `fathom*` files

### Example Output:
```
File prefix filter: "fathom"
Date filter: 2025-09-01 to 2025-09-30

📁 Folder: AI Coach - Meeting Transcripts
  Found 23 file(s) matching criteria...
✓ Downloaded: fathom_AICoach-09_30_25 09_14AM.txt
✓ Downloaded: fathom_AICoach-09_24_25 04_49AM-AICoachTestCall.txt
✓ Downloaded: fathom_AICoach-09_15_25 09_51AM.txt
... (20 more files)

Total files downloaded: 23
Total files converted to markdown: 23
```

## Technical Details

### Pattern Matching Priority

**Critical Bug Fix**: Pattern order matters!

**Problem**: If MM_DD_YY pattern checked before MM_DD_YYYY:
- `call_09_24_2025.txt` would match as `09_24_20`
- Interpreted as September 24, **2020** (wrong!)
- Last digit `25` would be ignored

**Solution**: Check more specific patterns first:
1. YYYY-MM-DD (4 digits at start)
2. MM-DD-YYYY (4 digits at end) ⚠️ **Must be before MM-DD-YY**
3. MM-DD-YY (2 digits at end)

### Timezone Handling

**Issue**: JavaScript `Date` objects are timezone-dependent.

**Solution in Tests**: Compare date components directly instead of ISO strings:
```javascript
// ❌ Bad: Timezone affects result
extractedDate.toISOString().split('T')[0]

// ✅ Good: Compare year, month, day directly
const year = extractedDate.getFullYear();
const month = extractedDate.getMonth() + 1;  // 1-indexed
const day = extractedDate.getDate();
```

**In Production**: Dates are compared as-is without timezone conversion, which is correct for local date filtering.

### Graceful Degradation

**Fallback Behavior**:
- If no date in filename → use modified date (old behavior)
- If date extraction fails → try next pattern
- If all patterns fail → use modified date
- System never crashes due to date parsing errors

## Files Modified

1. **transcripts/download-from-drive.js**
   - Added `extractDateFromFilename()` function
   - Updated `isWithinDateRange()` to accept filename parameter
   - Updated call to `isWithinDateRange()` to pass filename
   - Reordered date pattern matching (most specific first)
   - Enhanced prefix filtering (case-insensitive, anywhere in name)

2. **config.json**
   - Changed `filePrefix` from `"fathom-transcript"` to `"fathom"`

3. **config.ai-coach.json**
   - Changed `filePrefix` from `"fathom-transcript"` to `"fathom"`

4. **config.example.jsonc**
   - Changed `filePrefix` from `"fathom-transcript"` to `"fathom"`
   - Updated comment to explain new behavior

5. **test/test-date-extraction.js** (NEW)
   - Comprehensive test suite for date extraction
   - 11 test cases covering all supported formats

6. **package.json**
   - Added `test:date-extraction` script
   - Added to main `test` command

## Usage Examples

### Different Date Formats Work Seamlessly

```javascript
// Your files can use any of these formats:
'fathom_AICoach-09_30_25 09_14AM.txt'          // ✓ MM_DD_YY
'transcript-2025-09-24.txt'                     // ✓ YYYY-MM-DD
'meeting_2025_09_15.txt'                        // ✓ YYYY_MM_DD
'fathom-09-24-25.txt'                           // ✓ MM-DD-YY
'call_09_24_2025.txt'                           // ✓ MM_DD_YYYY
```

All formats are automatically detected and parsed correctly!

### Config Example

```json
{
  "transcripts": {
    "filePrefix": "fathom",  // Flexible prefix matching
    "dateFilter": {
      "startDate": "2025-09-01",
      "endDate": "2025-09-30",
      "enabled": true
    }
  }
}
```

### Testing

```bash
# Test date extraction
npm run test:date-extraction

# Run all tests (includes date extraction)
npm test

# Download transcripts (uses new date filtering)
npm run transcripts:download
```

## Benefits

1. **Reliability**: Filename-based dates are stable, modified dates are not
2. **Flexibility**: Supports multiple date formats automatically
3. **Robustness**: Handles edge cases gracefully with fallbacks
4. **Testing**: Comprehensive test suite ensures accuracy
5. **Backward Compatible**: Still works with files that don't have dates in filenames
6. **Cross-Project**: Same logic works for different projects using different date formats

## Future Enhancements

Potential improvements for future iterations:

1. **Add more date formats**: DMY formats (e.g., `25-09-2024`)
2. **Configurable date formats**: Allow users to specify expected format in config
3. **Debug logging**: Option to log which date extraction method was used
4. **Date format detection**: Auto-detect and report date format statistics
5. **Timezone configuration**: Allow explicit timezone specification if needed

## Summary

The enhanced date filtering system is now:
- ✅ **Robust**: Works even when files are modified
- ✅ **Flexible**: Supports multiple date formats
- ✅ **Tested**: Comprehensive test coverage
- ✅ **Reliable**: Prioritizes filename dates over metadata
- ✅ **Compatible**: Falls back gracefully when needed

**Result**: Successfully filtered 23 transcripts by date using filename-based date extraction! 🎉

