# Test Directory

This directory contains all test and demonstration scripts for the Data Source Orchestrator project.

## Test Scripts

### `test-name-matcher.js`
**Purpose**: Comprehensive test suite for the name matching utility (`lib/name-matcher.js`)

**Test Coverage**: 35 tests across 6 categories:
- Name normalization (8 tests)
- Loading team mappings (5 tests)
- Alias retrieval (5 tests)
- Team member matching (7 tests)
- Participant filtering (7 tests)
- Real-world scenarios (3 tests)

**Run**: `npm run test:name-matcher`

**Expected Result**: All 35 tests should pass ✅

---

### `test-error-handling.js`
**Purpose**: Tests the centralized error handling system

**Test Coverage**: 7 error types:
- ConfigurationError
- DatabaseConnectionError
- JiraAPIError
- GoogleDriveError
- FileSystemError
- ValidationError
- NetworkError

**Run**: `npm run test:error-handling`

**Expected Result**: Displays formatted error messages for all error types

---

### `test-transcript-conversion.js`
**Purpose**: Tests the transcript-to-markdown conversion and participant extraction

**Test Coverage**: 5 test scenarios:
- Date extraction from various filename formats
- Participant extraction from transcript content
- Manual participant list display
- Auto-extracted participant display
- Backward compatibility (no participants)

**Run**: `npm run test:transcript-conversion` or `npm run transcripts:test-convert`

**Expected Result**: All conversion scenarios work correctly, generates test files

**Clean up**: `Remove-Item -Recurse -Force test/test-files/`

---

### `test-download-conversion.js`
**Purpose**: Tests enhanced markdown conversion with participant extraction in download-from-drive.js

**Test Coverage**: Verifies:
- Participants extracted from transcript content
- Participants included in markdown output
- Logging shows participant count
- Markdown structure correct

**Run**: `npm run test:download-conversion`

**Expected Result**: Markdown file created with participants section

**Clean up**: `Remove-Item -Recurse -Force test/test-download-files/`

---

### `test-datasource-mapping.js`
**Purpose**: Tests datasource generator unified mapping format support

**Test Coverage**: 15 tests across 4 scenarios:
- Old string format: "Full Name": "shortname"
- New object format: { shortName, fullName, aliases }
- Mixed format: both old and new in same mapping
- Edge cases: hyphens, dots, spaces, special characters

**Additional Checks**:
- Mapping file resolution priority
- Project-specific mapping file detection
- Fallback mechanisms

**Run**: `npm run test:datasource-mapping`

**Expected Result**: All 15 tests pass (100%)

---

### `test-all-datasource-generators.js`
**Purpose**: Comprehensive test of all datasource generator scripts with unified mapping

**Test Coverage**: 19 tests across 5 categories:
- Shared mapping resolver module (2 tests)
- Shared resolver functions (4 tests)
- Generator scripts loading (4 tests)
- Generator instantiation (4 tests)
- Mapping files validation (5 tests)

**Verifies**:
- All generator scripts can load and use shared mapping resolver
- Unified mapping format works across all generators
- Both old and new mapping formats supported
- Project-specific mapping files correctly detected

**Run**: `npm run test:all-datasource-generators`

**Expected Result**: All 19 tests pass (100%)

---

### `demo-name-matcher.js`
**Purpose**: Interactive demonstration of the name matching utility

**Demonstrations**: 6 example scenarios:
1. Loading team mappings
2. Name normalization examples
3. Getting aliases for team members
4. Finding team member matches
5. Filtering transcript participants
6. Real-world integration example

**Run**: `npm run demo:name-matcher`

**Expected Result**: Shows interactive examples with visual output

---

## Running Tests

### Run All Tests
```bash
npm test
```
Runs both test-name-matcher.js and test-error-handling.js

### Run Individual Tests
```bash
npm run test:name-matcher              # Run name matcher tests
npm run test:error-handling            # Run error handling tests
npm run test:transcript-conversion     # Run transcript conversion tests
npm run test:download-conversion       # Run download conversion tests
npm run test:datasource-mapping        # Run datasource mapping tests
npm run test:all-datasource-generators # Run all datasource generator tests
npm run demo:name-matcher              # Run name matcher demo
```

---

## Test Results

All tests should pass with the following results:

**test-name-matcher.js**: 35/35 tests passing (100%)  
**test-error-handling.js**: Displays all 7 error types correctly  
**test-transcript-conversion.js**: All 5 conversion scenarios working correctly  
**test-download-conversion.js**: Markdown file created with participants section  
**test-datasource-mapping.js**: 15/15 tests passing (100%)  
**test-all-datasource-generators.js**: 19/19 tests passing (100%)

---

## Adding New Tests

When adding new test files:

1. Place them in this `test/` directory
2. Use relative imports: `require('../lib/module-name')`
3. Add npm script to `package.json` scripts section
4. Update this README with test description

Example package.json entry:
```json
"test:new-feature": "node test/test-new-feature.js"
```

---

## Notes

- All test files use relative imports (`../lib/...`) since they're in a subdirectory
- Tests should be self-contained and not modify production files
- Use descriptive test names and clear assertions
- Follow the existing error handling patterns

