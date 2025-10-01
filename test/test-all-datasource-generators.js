/**
 * Test script to verify all datasource generator scripts handle unified mapping format
 * Tests that all generators properly load and use the shared mapping resolver
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================================');
console.log('TEST: All Datasource Generators - Unified Mapping Support');
console.log('====================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ ${description}`);
    passedTests++;
    return true;
  } catch (error) {
    console.log(`  ✗ ${description}`);
    console.log(`    Error: ${error.message}`);
    failedTests++;
    return false;
  }
}

// Test 1: Verify shared mapping resolver module exists
console.log('TEST SECTION: Shared Mapping Resolver Module');
console.log('-'.repeat(60));

test('mapping-resolver.js exists', () => {
  const resolverPath = path.join(__dirname, '..', 'datasource-generator', 'lib', 'mapping-resolver.js');
  if (!fs.existsSync(resolverPath)) {
    throw new Error('mapping-resolver.js not found');
  }
});

test('mapping-resolver.js exports required functions', () => {
  const resolver = require('../datasource-generator/lib/mapping-resolver');
  if (typeof resolver.resolveTeamMappingFile !== 'function') {
    throw new Error('resolveTeamMappingFile not exported');
  }
  if (typeof resolver.loadTeamMapping !== 'function') {
    throw new Error('loadTeamMapping not exported');
  }
  if (typeof resolver.getShortName !== 'function') {
    throw new Error('getShortName not exported');
  }
});

// Test 2: Test shared resolver functions
console.log('\nTEST SECTION: Shared Resolver Functions');
console.log('-'.repeat(60));

const { loadTeamMapping, getShortName } = require('../datasource-generator/lib/mapping-resolver');
const config = require('../lib/config').load();

test('loadTeamMapping() loads default mapping', () => {
  const mapping = loadTeamMapping(config, path.join(__dirname, '..', 'datasource-generator'));
  if (!mapping.projectFolder) {
    throw new Error('No projectFolder in loaded mapping');
  }
  if (!mapping.mappings || typeof mapping.mappings !== 'object') {
    throw new Error('No mappings object in loaded mapping');
  }
});

test('getShortName() handles old format (string)', () => {
  const mapping = {
    mappings: {
      'Test Person': 'testperson'
    }
  };
  const result = getShortName('Test Person', mapping);
  if (result !== 'testperson') {
    throw new Error(`Expected "testperson", got "${result}"`);
  }
});

test('getShortName() handles new format (object)', () => {
  const mapping = {
    mappings: {
      'Test Person': {
        shortName: 'testperson',
        fullName: 'Test Person',
        aliases: ['Test', 'Person']
      }
    }
  };
  const result = getShortName('Test Person', mapping);
  if (result !== 'testperson') {
    throw new Error(`Expected "testperson", got "${result}"`);
  }
});

test('getShortName() handles unmapped names', () => {
  const mapping = { mappings: {} };
  const result = getShortName('John Doe', mapping);
  if (result !== 'john_doe') {
    throw new Error(`Expected "john_doe", got "${result}"`);
  }
});

// Test 3: Verify all generator scripts can be loaded
console.log('\nTEST SECTION: Generator Scripts Loading');
console.log('-'.repeat(60));

test('generate_datasources.js can be required', () => {
  // Clear cache to ensure fresh load
  const modulePath = path.join(__dirname, '..', 'datasource-generator', 'generate_datasources.js');
  delete require.cache[require.resolve(modulePath)];
  const DatasourceGenerator = require(modulePath);
  if (typeof DatasourceGenerator !== 'function') {
    throw new Error('DatasourceGenerator is not a constructor');
  }
});

test('generate_team_datasource.js can be required', () => {
  const modulePath = path.join(__dirname, '..', 'datasource-generator', 'generate_team_datasource.js');
  delete require.cache[require.resolve(modulePath)];
  const TeamDatasourceGenerator = require(modulePath);
  if (typeof TeamDatasourceGenerator !== 'function') {
    throw new Error('TeamDatasourceGenerator is not a constructor');
  }
});

test('generate_weekly_digest.js can be required', () => {
  const modulePath = path.join(__dirname, '..', 'datasource-generator', 'generate_weekly_digest.js');
  delete require.cache[require.resolve(modulePath)];
  const WeeklyDigestGenerator = require(modulePath);
  if (typeof WeeklyDigestGenerator !== 'function') {
    throw new Error('WeeklyDigestGenerator is not a constructor');
  }
});

test('generate_from_existing.js can be required', () => {
  const modulePath = path.join(__dirname, '..', 'datasource-generator', 'generate_from_existing.js');
  delete require.cache[require.resolve(modulePath)];
  const generateFromExisting = require(modulePath);
  if (typeof generateFromExisting !== 'function') {
    throw new Error('generateFromExisting is not a function');
  }
});

// Test 4: Verify generators can be instantiated
console.log('\nTEST SECTION: Generator Instantiation');
console.log('-'.repeat(60));

test('DatasourceGenerator can be instantiated', () => {
  const DatasourceGenerator = require('../datasource-generator/generate_datasources');
  const generator = new DatasourceGenerator();
  if (typeof generator.getShortName !== 'function') {
    throw new Error('getShortName method not found');
  }
  if (typeof generator.generateDatasourceForMember !== 'function') {
    throw new Error('generateDatasourceForMember method not found');
  }
});

test('DatasourceGenerator.getShortName() works with unified format', () => {
  const DatasourceGenerator = require('../datasource-generator/generate_datasources');
  const generator = new DatasourceGenerator();
  
  // Test with a known mapping (should be in team-name-mapping.json or team-name-mapping-ai-coach.json)
  const mapping = loadTeamMapping(config, path.join(__dirname, '..', 'datasource-generator'));
  const firstMember = Object.keys(mapping.mappings)[0];
  
  if (firstMember) {
    const shortName = generator.getShortName(firstMember);
    if (!shortName || typeof shortName !== 'string') {
      throw new Error('getShortName did not return a valid string');
    }
  }
});

test('TeamDatasourceGenerator can be instantiated', () => {
  const TeamDatasourceGenerator = require('../datasource-generator/generate_team_datasource');
  const generator = new TeamDatasourceGenerator();
  if (!generator.projectName) {
    throw new Error('projectName not set');
  }
});

test('WeeklyDigestGenerator can be instantiated', () => {
  const WeeklyDigestGenerator = require('../datasource-generator/generate_weekly_digest');
  const generator = new WeeklyDigestGenerator();
  if (!generator.projectName) {
    throw new Error('projectName not set');
  }
});

// Test 5: Verify mapping files exist
console.log('\nTEST SECTION: Mapping Files');
console.log('-'.repeat(60));

test('Default mapping file exists', () => {
  const defaultPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping.json');
  if (!fs.existsSync(defaultPath)) {
    throw new Error('team-name-mapping.json not found');
  }
});

test('Default mapping has valid structure', () => {
  const defaultPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping.json');
  const mapping = require(defaultPath);
  if (!mapping.projectFolder) {
    throw new Error('No projectFolder in default mapping');
  }
  if (!mapping.mappings || typeof mapping.mappings !== 'object') {
    throw new Error('No mappings object in default mapping');
  }
});

test('AI Coach mapping file exists', () => {
  const aiCoachPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping-ai-coach.json');
  if (!fs.existsSync(aiCoachPath)) {
    throw new Error('team-name-mapping-ai-coach.json not found');
  }
});

test('AI Coach mapping has valid structure', () => {
  const aiCoachPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping-ai-coach.json');
  const mapping = require(aiCoachPath);
  if (mapping.projectFolder !== 'ai-coach') {
    throw new Error(`Expected projectFolder "ai-coach", got "${mapping.projectFolder}"`);
  }
  if (!mapping.mappings || typeof mapping.mappings !== 'object') {
    throw new Error('No mappings object in AI Coach mapping');
  }
});

test('AI Coach mapping uses new object format', () => {
  const aiCoachPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping-ai-coach.json');
  const mapping = require(aiCoachPath);
  const firstMember = Object.keys(mapping.mappings)[0];
  const memberMapping = mapping.mappings[firstMember];
  
  if (typeof memberMapping === 'string') {
    throw new Error('AI Coach mapping still using old string format');
  }
  if (!memberMapping.shortName || !memberMapping.fullName || !memberMapping.aliases) {
    throw new Error('AI Coach mapping missing required fields (shortName, fullName, aliases)');
  }
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total Tests: ${totalTests}`);
console.log(`✓ Passed: ${passedTests}`);
console.log(`✗ Failed: ${failedTests}`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('='.repeat(70));

if (failedTests === 0) {
  console.log('\n🎉 All datasource generator scripts support unified mapping format!\n');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the errors above.\n');
  process.exit(1);
}

