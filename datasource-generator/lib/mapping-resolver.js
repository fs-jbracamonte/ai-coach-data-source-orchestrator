/**
 * Shared utility for resolving team name mapping files
 * Used by all datasource generator scripts
 */

const fs = require('fs');
const path = require('path');

/**
 * Determine the team mapping file to use
 * Priority:
 * 1. config.transcripts.teamMappingFile (if specified)
 * 2. Auto-detect based on projectFolder in default mapping file
 * 3. Fall back to team-name-mapping.json
 * 
 * @param {Object} config - Configuration object (from lib/config.js)
 * @param {string} baseDir - Base directory for mapping files (typically __dirname of caller)
 * @returns {string|null} Path to the mapping file to use, or null if none found
 */
function resolveTeamMappingFile(config, baseDir = __dirname) {
  // Check if mapping file is specified in config
  if (config.transcripts && config.transcripts.teamMappingFile) {
    const specifiedPath = path.resolve(config.transcripts.teamMappingFile);
    if (fs.existsSync(specifiedPath)) {
      console.log(`Using team mapping from config: ${config.transcripts.teamMappingFile}`);
      return specifiedPath;
    } else {
      console.warn(`Configured team mapping file not found: ${config.transcripts.teamMappingFile}`);
    }
  }
  
  // Try default mapping file to get projectFolder
  const defaultMappingPath = path.join(baseDir, 'team-name-mapping.json');
  if (fs.existsSync(defaultMappingPath)) {
    try {
      // Clear require cache to ensure fresh data
      delete require.cache[require.resolve(defaultMappingPath)];
      const defaultMapping = require(defaultMappingPath);
      const projectFolder = defaultMapping.projectFolder;
      
      if (projectFolder && projectFolder !== 'default') {
        // Try to find project-specific mapping: team-name-mapping-{projectFolder}.json
        const projectMappingPath = path.join(baseDir, `team-name-mapping-${projectFolder}.json`);
        if (fs.existsSync(projectMappingPath)) {
          console.log(`Using project-specific mapping: team-name-mapping-${projectFolder}.json`);
          return projectMappingPath;
        }
      }
    } catch (error) {
      console.warn('Error reading default mapping file:', error.message);
    }
    
    // Use default mapping
    console.log('Using default team mapping: team-name-mapping.json');
    return defaultMappingPath;
  }
  
  console.warn('No team mapping file found, using empty mappings');
  return null;
}

/**
 * Load team name mapping with automatic file resolution
 * 
 * @param {Object} config - Configuration object
 * @param {string} baseDir - Base directory for mapping files
 * @returns {Object} Team mapping object with projectFolder and mappings
 */
function loadTeamMapping(config, baseDir = __dirname) {
  const mappingPath = resolveTeamMappingFile(config, baseDir);
  
  if (mappingPath && fs.existsSync(mappingPath)) {
    // Clear require cache to ensure fresh data
    delete require.cache[require.resolve(mappingPath)];
    return require(mappingPath);
  }
  
  return { projectFolder: 'default', mappings: {} };
}

/**
 * Get the short name for a team member
 * 
 * Supports both mapping formats:
 * - Old format: "Team Member Name": "shortname"
 * - New format: "Team Member Name": { shortName: "shortname", fullName: "...", aliases: [...] }
 * 
 * @param {string} fullName - The full name of the team member
 * @param {Object} nameMapping - The team name mapping object
 * @returns {string} The short name identifier (lowercase with underscores)
 */
function getShortName(fullName, nameMapping) {
  const mapping = nameMapping.mappings[fullName];
  
  if (mapping) {
    // New object format: { shortName, fullName, aliases }
    if (typeof mapping === 'object' && mapping.shortName) {
      return mapping.shortName;
    }
    
    // Old string format: "shortname"
    if (typeof mapping === 'string') {
      return mapping;
    }
  }
  
  // If no mapping, use full name converted to lowercase with underscores
  // This provides a fallback for team members not in the mapping file
  return fullName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
}

module.exports = {
  resolveTeamMappingFile,
  loadTeamMapping,
  getShortName
};

