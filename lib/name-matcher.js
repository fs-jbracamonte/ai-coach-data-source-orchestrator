const fs = require('fs');
const path = require('path');
const { ConfigurationError, FileSystemError } = require('./errors');

/**
 * NameMatcher - Utility for matching transcript participant names to team members
 * 
 * This module provides functionality for:
 * - Loading and caching team name mapping files
 * - Normalizing names for case-insensitive comparison
 * - Finding team member matches from transcript participants
 * - Filtering transcripts based on team member participation
 * 
 * @module lib/name-matcher
 */

// Cache for loaded team mappings
const mappingCache = new Map();

/**
 * Loads and caches the team name mapping JSON file
 * 
 * The mapping file should have the structure:
 * {
 *   "projectFolder": "project-name",
 *   "mappings": {
 *     "Full Name": {
 *       "shortName": "identifier",
 *       "fullName": "Full Name",
 *       "aliases": ["alias1", "alias2", ...]
 *     }
 *   }
 * }
 * 
 * @param {string} mappingFile - Path to the team name mapping file (relative to project root)
 * @returns {Object} Mapping object with projectFolder and mappings
 * @throws {ConfigurationError} If mapping file path is missing
 * @throws {FileSystemError} If file cannot be read or parsed
 * 
 * @example
 * const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
 * console.log(mapping.projectFolder); // "rocks"
 */
function loadTeamMapping(mappingFile) {
  if (!mappingFile) {
    throw new ConfigurationError(
      'Team name mapping file path is required',
      {
        resolutionSteps: [
          'Provide a valid path to the team name mapping file',
          'Example: "datasource-generator/team-name-mapping.json"',
          'Ensure the file exists in your project'
        ]
      }
    );
  }

  // Return cached mapping if available
  if (mappingCache.has(mappingFile)) {
    return mappingCache.get(mappingFile);
  }

  // Resolve path relative to project root
  const resolvedPath = path.resolve(process.cwd(), mappingFile);

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new FileSystemError(
      `Team name mapping file not found: ${mappingFile}`,
      {
        operation: 'read',
        filePath: resolvedPath,
        resolutionSteps: [
          `Create the mapping file at: ${mappingFile}`,
          'Copy from team-name-mapping.json template',
          'Ensure the file path is correct in your configuration',
          'Check that the file exists in the datasource-generator directory'
        ]
      }
    );
  }

  try {
    // Read and parse the mapping file
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const mapping = JSON.parse(fileContent);

    // Validate basic structure
    if (!mapping.mappings || typeof mapping.mappings !== 'object') {
      throw new ConfigurationError(
        `Invalid team name mapping structure in ${mappingFile}: missing or invalid 'mappings' object`,
        {
          resolutionSteps: [
            'Ensure the mapping file has a "mappings" object',
            'See team-name-mapping.json for correct structure',
            'Structure should be: { "projectFolder": "name", "mappings": {...} }'
          ]
        }
      );
    }

    // Cache the mapping
    mappingCache.set(mappingFile, mapping);

    return mapping;
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof FileSystemError) {
      throw error;
    }

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      throw new FileSystemError(
        `Invalid JSON in team name mapping file: ${mappingFile}`,
        {
          operation: 'read',
          filePath: resolvedPath,
          originalError: error.message,
          resolutionSteps: [
            'Check the mapping file for JSON syntax errors',
            'Ensure all quotes are properly closed',
            'Verify no trailing commas in arrays or objects',
            'Use a JSON validator to check syntax'
          ]
        }
      );
    }

    // Handle other file system errors
    throw new FileSystemError(
      `Failed to read team name mapping file: ${mappingFile}`,
      {
        operation: 'read',
        filePath: resolvedPath,
        originalError: error.message,
        resolutionSteps: [
          'Check file permissions',
          'Ensure the file is not locked by another process',
          'Verify the file path is correct'
        ]
      }
    );
  }
}

/**
 * Normalizes a name for case-insensitive comparison
 * 
 * Normalization includes:
 * - Convert to lowercase
 * - Trim leading/trailing whitespace
 * - Remove common punctuation (periods, commas)
 * - Collapse multiple spaces to single space
 * - Remove hyphens and underscores
 * 
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name for comparison
 * 
 * @example
 * normalizeNameForMatching("John   Doe, Jr.")  // "john doe jr"
 * normalizeNameForMatching("Mark J. Smith")    // "mark j smith"
 * normalizeNameForMatching("Allan-Arneil")     // "allan arneil"
 */
function normalizeNameForMatching(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .toLowerCase()                    // Convert to lowercase
    .trim()                           // Remove leading/trailing whitespace
    .replace(/[.,;:]/g, '')          // Remove punctuation (periods, commas, etc.)
    .replace(/[-_]/g, ' ')           // Replace hyphens and underscores with spaces
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to single space
    .trim();                          // Trim again after replacements
}

/**
 * Gets all possible name variations for a team member
 * 
 * Returns an array containing:
 * - The full name (or mapping key)
 * - All aliases from the mapping
 * 
 * All names are normalized for comparison.
 * Handles both old string format ("Name": "shortname") and new object format.
 * 
 * @param {string} teamMemberKey - The key in the mappings object (e.g., "John Doe")
 * @param {Object} mapping - The team name mapping object
 * @returns {Array<string>} Array of normalized name variations
 * 
 * @example
 * const aliases = getAllAliases("Mark Jerly Bundalian", mapping);
 * // Returns: ["mark jerly bundalian", "mark", "bundalian", "m bundalian", ...]
 */
function getAllAliases(teamMemberKey, mapping) {
  if (!teamMemberKey || !mapping || !mapping.mappings) {
    return [];
  }

  const memberData = mapping.mappings[teamMemberKey];
  
  if (!memberData) {
    return [normalizeNameForMatching(teamMemberKey)];
  }

  const aliases = [];

  // Handle new object format
  if (typeof memberData === 'object') {
    // Add full name (prefer explicit fullName field, fall back to key)
    const fullName = memberData.fullName || teamMemberKey;
    aliases.push(normalizeNameForMatching(fullName));

    // Add all aliases
    if (Array.isArray(memberData.aliases)) {
      for (const alias of memberData.aliases) {
        const normalized = normalizeNameForMatching(alias);
        if (normalized && !aliases.includes(normalized)) {
          aliases.push(normalized);
        }
      }
    }
  } 
  // Handle old string format for backward compatibility
  else if (typeof memberData === 'string') {
    aliases.push(normalizeNameForMatching(teamMemberKey));
    aliases.push(normalizeNameForMatching(memberData));
  }

  // Always include the original key normalized
  const normalizedKey = normalizeNameForMatching(teamMemberKey);
  if (!aliases.includes(normalizedKey)) {
    aliases.push(normalizedKey);
  }

  return aliases;
}

/**
 * Finds which team member (if any) matches a transcript participant name
 * 
 * Matching algorithm:
 * 1. Normalizes the participant name
 * 2. For each team member in the config:
 *    a. Gets all aliases for that team member
 *    b. Checks for exact match (case-insensitive)
 * 3. Returns first match found
 * 
 * @param {string} participantName - Name from transcript (e.g., "Mark", "J. Doe")
 * @param {Array<string>} teamMembers - Array of team member full names from config
 * @param {Object} mapping - The team name mapping object
 * @returns {Object|null} Match result { teamMember: "Full Name", matchedVia: "alias name" } or null if no match
 * 
 * @example
 * const result = findMatchingTeamMember("Mark", ["Mark Jerly Bundalian"], mapping);
 * // Returns: { teamMember: "Mark Jerly Bundalian", matchedVia: "mark" }
 * 
 * const noMatch = findMatchingTeamMember("Unknown Person", ["John Doe"], mapping);
 * // Returns: null
 */
function findMatchingTeamMember(participantName, teamMembers, mapping) {
  if (!participantName || !teamMembers || !Array.isArray(teamMembers) || !mapping) {
    return null;
  }

  const normalizedParticipant = normalizeNameForMatching(participantName);
  
  if (!normalizedParticipant) {
    return null;
  }

  // Try to match against each team member
  for (const teamMember of teamMembers) {
    const aliases = getAllAliases(teamMember, mapping);
    
    // Check if participant matches any alias
    for (const alias of aliases) {
      if (alias === normalizedParticipant) {
        return {
          teamMember: teamMember,
          matchedVia: alias
        };
      }
    }
  }

  return null;
}

/**
 * Filters transcript participants to find team member matches
 * Determines if a transcript should be included based on team member participation
 * 
 * Algorithm:
 * 1. Normalizes all participant names from transcript
 * 2. Finds matching team members for each participant
 * 3. Counts unique team member matches
 * 4. Compares against minimum required threshold
 * 
 * @param {Array<string>} participants - Array of participant names from transcript
 * @param {Array<string>} teamMembers - Array of team member full names from config
 * @param {Object} mapping - The team name mapping object
 * @param {number} [minimumRequired=1] - Minimum number of team members required
 * @returns {Object} Result object with:
 *   - shouldInclude {boolean}: Whether transcript meets minimum threshold
 *   - matches {Array}: Array of matched team member names
 *   - matchedCount {number}: Number of team members matched
 *   - participantCount {number}: Total number of participants checked
 *   - warning {string}: Optional warning message if edge cases detected
 * 
 * @example
 * const result = filterParticipantsByTeam(
 *   ["Mark", "Jane Smith", "Unknown Person"],
 *   ["Mark Jerly Bundalian", "Jamnilloh Bracamonte"],
 *   mapping,
 *   1
 * );
 * // Returns: {
 * //   shouldInclude: true,
 * //   matches: ["Mark Jerly Bundalian"],
 * //   matchedCount: 1,
 * //   participantCount: 3
 * // }
 */
function filterParticipantsByTeam(participants, teamMembers, mapping, minimumRequired = 1) {
  // Handle empty teamMembers array - include all transcripts by default
  if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
    console.warn('⚠ filterParticipantsByTeam: Empty teamMembers array - including all transcripts');
    return {
      shouldInclude: true,
      matches: [],
      matchedCount: 0,
      participantCount: participants ? participants.length : 0,
      warning: 'Empty teamMembers array'
    };
  }

  // Handle empty participants array - exclude by default
  if (!Array.isArray(participants) || participants.length === 0) {
    return {
      shouldInclude: false,
      matches: [],
      matchedCount: 0,
      participantCount: 0,
      warning: 'No participants detected in transcript'
    };
  }

  // Validate mapping
  if (!mapping || !mapping.mappings) {
    console.warn('⚠ filterParticipantsByTeam: Invalid mapping object - including all transcripts');
    return {
      shouldInclude: true,
      matches: [],
      matchedCount: 0,
      participantCount: participants.length,
      warning: 'Invalid mapping object'
    };
  }

  // Find all matching team members
  const matches = [];
  const matchedTeamMembers = new Set(); // Use Set to avoid duplicates

  for (const participant of participants) {
    const match = findMatchingTeamMember(participant, teamMembers, mapping);
    
    if (match && !matchedTeamMembers.has(match.teamMember)) {
      matchedTeamMembers.add(match.teamMember);
      matches.push({
        participant: participant,
        teamMember: match.teamMember,
        matchedVia: match.matchedVia
      });
    }
  }

  const matchedCount = matchedTeamMembers.size;
  const shouldInclude = matchedCount >= minimumRequired;

  return {
    shouldInclude: shouldInclude,
    matches: Array.from(matchedTeamMembers), // Return array of team member names
    matchedCount: matchedCount,
    participantCount: participants.length
  };
}

/**
 * Clears the mapping cache (useful for testing)
 * 
 * @example
 * clearCache(); // Clears all cached mappings
 */
function clearCache() {
  mappingCache.clear();
}

module.exports = {
  loadTeamMapping,
  normalizeNameForMatching,
  getAllAliases,
  findMatchingTeamMember,
  filterParticipantsByTeam,
  clearCache
};

