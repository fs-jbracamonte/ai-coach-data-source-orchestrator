#!/usr/bin/env node
/**
 * Centralized Cleaning Script
 * 
 * Removes generated and downloaded data from all or specified modules.
 * Supports team-scoped and projectFolder-scoped cleaning.
 * Auto-discovers projects from mapping files and existing outputs.
 * Preserves Slack users.json by default.
 */

const fs = require('fs');
const path = require('path');
const { getProjectFolder } = require('../lib/project-folder');

// Module definitions: [name, directories to clean]
const MODULES = {
  daily: [
    'daily-reports/data',
    'daily-reports/md-output'
  ],
  jira: [
    'jira/data',
    'jira/md_output'
  ],
  transcripts: [
    'transcripts/downloads',
    'transcripts/markdown-output'
  ],
  slack: [
    'slack/data',
    'slack/md-output'
  ],
  datasource: [
    'datasource-generator/output'
  ]
};

const ALL_MODULES = Object.keys(MODULES);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    team: null,
    projectFolder: null,
    modules: ALL_MODULES,
    purgeSlackUsers: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--team=')) {
      options.team = arg.split('=')[1];
    } else if (arg === '--team' && i + 1 < args.length) {
      options.team = args[++i];
    } else if (arg.startsWith('--projectFolder=')) {
      options.projectFolder = arg.split('=')[1];
    } else if (arg === '--projectFolder' && i + 1 < args.length) {
      options.projectFolder = args[++i];
    } else if (arg.startsWith('--modules=')) {
      const moduleList = arg.split('=')[1].split(',').map(m => m.trim());
      options.modules = moduleList.filter(m => ALL_MODULES.includes(m));
    } else if (arg === '--modules' && i + 1 < args.length) {
      const moduleList = args[++i].split(',').map(m => m.trim());
      options.modules = moduleList.filter(m => ALL_MODULES.includes(m));
    } else if (arg === '--purge-slack-users') {
      options.purgeSlackUsers = true;
    }
  }

  return options;
}

/**
 * Discover all project folders from mapping files and existing outputs
 */
function discoverProjectFolders() {
  const projectFolders = new Set();

  // 1. Read projectFolder from mapping files: datasource-generator/team-name-mapping*.json
  const generatorDir = path.join(__dirname, '..', 'datasource-generator');
  if (fs.existsSync(generatorDir)) {
    const files = fs.readdirSync(generatorDir);
    for (const file of files) {
      if (file.startsWith('team-name-mapping') && file.endsWith('.json')) {
        try {
          const mappingPath = path.join(generatorDir, file);
          const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
          if (mapping.projectFolder && typeof mapping.projectFolder === 'string') {
            projectFolders.add(mapping.projectFolder.trim());
          }
        } catch (err) {
          // Ignore parse errors, continue discovery
        }
      }
    }
  }

  // 2. Union with existing subfolders under module outputs
  const outputDirs = [
    'datasource-generator/output',
    'jira/data',
    'jira/md_output',
    'daily-reports/data',
    'daily-reports/md-output',
    'transcripts/downloads',
    'transcripts/markdown-output',
    'slack/data',
    'slack/md-output'
  ];

  for (const dir of outputDirs) {
    const fullPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(fullPath)) {
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== '.gitkeep') {
            projectFolders.add(entry.name);
          }
        }
      } catch (err) {
        // Ignore read errors
      }
    }
  }

  return Array.from(projectFolders).sort();
}

/**
 * Remove a directory recursively
 */
function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.error(`  ✗ Error removing ${dirPath}: ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Clean Slack directory with users.json preservation
 */
function cleanSlackDirectory(dirPath, purgeUsers) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let deletedCount = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively clean subdirectories
        if (removeDirectory(entryPath)) {
          deletedCount++;
        }
      } else {
        // Preserve users.json unless purge flag is set
        if (!purgeUsers && entry.name.toLowerCase() === 'users.json') {
          continue;
        }
        try {
          fs.unlinkSync(entryPath);
          deletedCount++;
        } catch (err) {
          console.error(`  ✗ Error deleting ${entryPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`  ✗ Error reading ${dirPath}: ${err.message}`);
  }

  return deletedCount;
}

/**
 * Clean a specific module for a specific project folder
 */
function cleanModuleForProject(moduleName, projectFolder, purgeSlackUsers) {
  const dirs = MODULES[moduleName];
  let totalDeleted = 0;

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir, projectFolder);
    
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    console.log(`  Cleaning ${dir}/${projectFolder}/...`);

    if (moduleName === 'slack') {
      // Special handling for Slack to preserve users.json
      const deleted = cleanSlackDirectory(dirPath, purgeSlackUsers);
      if (deleted > 0) {
        console.log(`    ✓ Removed ${deleted} item(s)`);
        totalDeleted += deleted;
      }
      // Remove directory if empty (except for users.json)
      try {
        const remaining = fs.readdirSync(dirPath);
        if (remaining.length === 0 || (!purgeSlackUsers && remaining.length === 1 && remaining[0].toLowerCase() === 'users.json')) {
          // Keep directory with users.json or remove if empty
          if (remaining.length === 0) {
            fs.rmdirSync(dirPath);
          }
        }
      } catch (err) {
        // Ignore
      }
    } else {
      // Regular removal for other modules
      if (removeDirectory(dirPath)) {
        console.log(`    ✓ Removed`);
        totalDeleted++;
      }
    }
  }

  return totalDeleted;
}

/**
 * Clean Jira changelog caches (global, not project-specific)
 */
function cleanJiraChangelogCaches() {
  const cachedirs = [
    path.join(__dirname, '..', 'jira', 'data', 'changelogs'),
    path.join(__dirname, '..', 'jira', 'data', 'by-assignee', 'changelogs')
  ];

  let removed = 0;
  for (const cacheDir of cachedirs) {
    if (fs.existsSync(cacheDir)) {
      console.log(`  Removing Jira changelog cache: ${path.relative(path.join(__dirname, '..'), cacheDir)}/`);
      if (removeDirectory(cacheDir)) {
        console.log(`    ✓ Removed`);
        removed++;
      }
    }
  }

  return removed;
}

/**
 * Clean root-level files in module directories (legacy data before project-scoping)
 */
function cleanRootLevelFiles() {
  const rootDirs = [
    { dir: 'jira/data', extensions: ['.csv'] },
    { dir: 'jira/md_output', extensions: ['.md'] },
    { dir: 'daily-reports/data', extensions: ['.csv'] },
    { dir: 'daily-reports/md-output', extensions: ['.md'] },
    { dir: 'transcripts/downloads', extensions: ['.txt'] },
    { dir: 'transcripts/markdown-output', extensions: ['.md'] }
  ];

  let totalRemoved = 0;

  for (const { dir, extensions } of rootDirs) {
    const fullPath = path.join(__dirname, '..', dir);
    
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip directories and .gitkeep files
        if (entry.isDirectory() || entry.name === '.gitkeep') {
          continue;
        }

        // Check if file matches one of the extensions
        const hasMatchingExt = extensions.some(ext => entry.name.endsWith(ext));
        
        if (hasMatchingExt) {
          const filePath = path.join(fullPath, entry.name);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Cleaning root-level file: ${dir}/${entry.name}`);
            console.log(`    ✓ Removed`);
            totalRemoved++;
          } catch (err) {
            console.error(`    ✗ Error deleting ${entry.name}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ Error reading ${dir}: ${err.message}`);
    }
  }

  return totalRemoved;
}

/**
 * Main cleaning function
 */
function main() {
  console.log('='.repeat(60));
  console.log('Centralized Cleaning Script');
  console.log('='.repeat(60));
  console.log();

  const options = parseArgs();

  // Resolve project folder
  let projectFolders = [];

  if (options.team) {
    // Team-scoped: resolve via getProjectFolder
    console.log(`Team-scoped cleaning: ${options.team}`);
    try {
      const resolved = getProjectFolder(options.team, null);
      projectFolders = [resolved];
      console.log(`Resolved to projectFolder: ${resolved}`);
    } catch (err) {
      console.error(`Error resolving team '${options.team}': ${err.message}`);
      process.exit(1);
    }
  } else if (options.projectFolder) {
    // Project folder specified
    console.log(`ProjectFolder-scoped cleaning: ${options.projectFolder}`);
    projectFolders = [options.projectFolder];
  } else {
    // Default: clean all discovered projects
    console.log('Discovering project folders...');
    projectFolders = discoverProjectFolders();
    console.log(`Found ${projectFolders.length} project folder(s): ${projectFolders.join(', ') || '(none)'}`);
  }

  if (projectFolders.length === 0) {
    console.log('\nNo project folders to clean. Nothing to do.');
    return;
  }

  console.log(`\nModules to clean: ${options.modules.join(', ')}`);
  if (options.modules.includes('slack')) {
    console.log(`Slack users.json: ${options.purgeSlackUsers ? 'will be removed' : 'will be preserved'}`);
  }
  console.log();

  let totalCleaned = 0;

  // Clean each module for each project folder
  for (const projectFolder of projectFolders) {
    console.log(`\nCleaning project: ${projectFolder}`);
    console.log('-'.repeat(60));

    for (const moduleName of options.modules) {
      const cleaned = cleanModuleForProject(moduleName, projectFolder, options.purgeSlackUsers);
      totalCleaned += cleaned;
    }
  }

  // Always clean Jira changelog caches when jira module is selected
  if (options.modules.includes('jira')) {
    console.log('\nCleaning Jira changelog caches (global)');
    console.log('-'.repeat(60));
    const cachesCleaned = cleanJiraChangelogCaches();
    totalCleaned += cachesCleaned;
  }

  // Clean root-level files (legacy data before project-scoping)
  console.log('\nCleaning root-level files (legacy data)');
  console.log('-'.repeat(60));
  const rootCleaned = cleanRootLevelFiles();
  totalCleaned += rootCleaned;
  if (rootCleaned === 0) {
    console.log('  No root-level files found');
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`Cleaning complete! Removed ${totalCleaned} item(s).`);
  console.log('='.repeat(60));
}

if (require.main === module) {
  main();
}

module.exports = { main, discoverProjectFolders };



