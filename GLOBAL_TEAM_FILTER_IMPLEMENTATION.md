# Global Team Filter Implementation Summary

## Overview

Implemented a feature-flagged global team member filter that applies to ALL transcript folders (not just `multiProjectFolders`) when enabled via environment variable. This allows excluding 1:1 manager reviews where only one team member is present from datasource generation.

## What Was Changed

### 1. Core Implementation (`transcripts/download-from-drive.js`)

**Environment Variable Added:**
- `TRANSCRIPTS_GLOBAL_TEAM_FILTER` - Set to `true` or `1` to enable global filtering

**Logic Changes:**
- Added global filter flag constant that reads from `process.env.TRANSCRIPTS_GLOBAL_TEAM_FILTER`
- Modified `teamFilterActive` determination to activate when either:
  - Legacy condition: `filterByTeamMembers && teamMembers.length > 0 && isMultiProjectFolder`
  - New condition: `GLOBAL_TEAM_FILTER_ENABLED && teamMembers.length > 0`
- Updated logging to indicate when global filter is active
- Team filtering now applies before markdown conversion for ALL folders when flag is set

**Behavior:**
- When `TRANSCRIPTS_GLOBAL_TEAM_FILTER=true`:
  - Downloads transcripts from all folders
  - Extracts participants from each transcript
  - Matches participants against `config.transcripts.teamMembers` using the name mapping
  - Excludes transcripts where matched team members < `config.transcripts.minimumTeamMembersRequired`
  - Deletes excluded transcript files (not converted to markdown)
- When flag is OFF (default):
  - Existing behavior unchanged
  - Only `multiProjectFolders` use team filtering

### 2. Documentation Updates

**`.github/copilot-instructions.md`:**
- Added new "Global Team Filter (Env-Controlled)" section under Transcripts
- Documented purpose, use case, activation, behavior, and examples
- Clarified threshold comes from config (not env override)

**`configs/shared/defaults.json`:**
- Updated comment to mention the global filter env flag

### 3. Testing

**New Test File (`test/test-global-team-filter.js`):**
- 14 comprehensive tests covering:
  - Participant extraction from different transcript formats
  - Filtering with different `minimumTeamMembersRequired` thresholds (1 vs 2)
  - Edge cases (empty arrays, high thresholds, etc.)
  - Real-world config scenarios (1on1, team, weekly)
- All tests pass ✅

**New Demo Script (`test/demo-global-team-filter.js`):**
- Interactive demonstration showing how filtering works
- Compares behavior with threshold=1 vs threshold=2
- Shows 1:1 review exclusion vs team meeting inclusion
- Provides usage examples

**Package.json:**
- Added `test:global-team-filter` script
- Integrated into main `npm test` suite

## Usage Examples

### Exclude 1:1 Manager Reviews from Timeclock 1on1 Reports

1. Set `minimumTeamMembersRequired: 2` in `configs/timeclock/config.1on1.json`:
   ```json
   {
     "transcripts": {
       "minimumTeamMembersRequired": 2
     }
   }
   ```

2. Run with global filter enabled:
   ```bash
   cross-env TRANSCRIPTS_GLOBAL_TEAM_FILTER=true npm run timeclock:1on1
   ```

**Result:** 
- 1:1 meetings (1 team member + 1 manager) are excluded
- Team meetings (2+ team members) are included
- All other data sources (daily reports, Jira) remain unchanged

### Keep Default Behavior (No Change)

Simply run without the env flag:
```bash
npm run timeclock:1on1
```

**Result:** Only `multiProjectFolders` use team filtering (existing behavior)

## Testing the Implementation

### Run Automated Tests
```bash
npm run test:global-team-filter
```

### Run Demo
```bash
node test/demo-global-team-filter.js
```

### Manual Verification
```bash
# Clean existing transcripts
npm run clean -- --modules transcripts --projectFolder timeclock

# Run with global filter ON and threshold=2
cross-env TRANSCRIPTS_GLOBAL_TEAM_FILTER=true npm run timeclock:1on1

# Check console output for filtering summary
# Verify only multi-participant transcripts converted to markdown
```

## Configuration Reference

### Env Variable
- **Name:** `TRANSCRIPTS_GLOBAL_TEAM_FILTER`
- **Values:** `true` or `1` to enable; any other value (or unset) disables
- **Scope:** Applies to all transcript folders when enabled
- **Default:** OFF (no behavior change)

### Config Settings Used
- `config.transcripts.teamMembers[]` - Array of team member full names
- `config.transcripts.minimumTeamMembersRequired` - Minimum matched team members (default: 1)
- `config.transcripts.teamMappingFile` - Path to name mapping file
- `config.transcripts.filterByTeamMembers` - Legacy per-folder flag (still works)
- `config.transcripts.multiProjectFolders[]` - Legacy per-folder list (still works)

## Safety & Rollout

- **Backward Compatible:** Default OFF - existing workflows unchanged
- **Fail-Open:** If `teamMembers` empty or mapping missing, includes transcripts (no false negatives)
- **Clear Logging:** Console shows when global filter is active and filtering summary
- **Non-Destructive:** Can re-run with flag OFF to include previously excluded transcripts
- **No Schema Changes:** Pure runtime feature via env flag

## Files Modified

1. `transcripts/download-from-drive.js` - Core filtering logic
2. `.github/copilot-instructions.md` - Documentation
3. `configs/shared/defaults.json` - Comment update
4. `test/test-global-team-filter.js` - Automated tests (new)
5. `test/demo-global-team-filter.js` - Demo script (new)
6. `package.json` - Test script integration

## Performance Impact

- **Minimal:** Participant extraction already happens during markdown conversion
- **Filtering:** O(n*m) where n=participants, m=teamMembers (typically < 20)
- **Downloads:** No change - all files still downloaded (filtering happens post-download)
- **Conversion:** Reduces markdown conversions for excluded transcripts

## Future Enhancements (Not Implemented)

These were considered but explicitly not implemented per user feedback:
- ❌ `TRANSCRIPTS_MIN_TEAM_MEMBERS` env variable (use config instead)
- ❌ Pre-download filtering (existing content search handles this for multiProjectFolders)
- ❌ Per-member transcript filtering during 1on1 generation (not needed - filtering happens upstream)

