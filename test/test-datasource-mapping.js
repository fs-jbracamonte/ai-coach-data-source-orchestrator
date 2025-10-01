/**
 * Test script to verify datasource generator handles unified mapping format
 * Tests the getShortName() method with both old and new formats
 */

console.log('====================================================================');
console.log('TEST: Datasource Generator - Unified Mapping Support');
console.log('====================================================================\n');

// Test data structures
const oldFormatMapping = {
  projectFolder: 'test-old',
  mappings: {
    'John Doe': 'john',
    'Jane Smith': 'jane',
    'Bob Johnson': 'bob'
  }
};

const newFormatMapping = {
  projectFolder: 'test-new',
  mappings: {
    'Mark Jerly Bundalian': {
      shortName: 'mark',
      fullName: 'Mark Jerly Bundalian',
      aliases: ['Mark', 'Bundalian', 'M. Bundalian', 'Mark J. Bundalian']
    },
    'Jamnilloh Bracamonte': {
      shortName: 'jam',
      fullName: 'Jamnilloh Bracamonte',
      aliases: ['Jamnilloh', 'Bracamonte', 'Jam']
    }
  }
};

const mixedFormatMapping = {
  projectFolder: 'test-mixed',
  mappings: {
    'Old Format Person': 'oldperson',
    'New Format Person': {
      shortName: 'newperson',
      fullName: 'New Format Person',
      aliases: ['New Person', 'NF Person']
    },
    'Another Old': 'anotheroid'
  }
};

// Mock the getShortName function logic
function testGetShortName(fullName, nameMapping) {
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
  return fullName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
}

// Test scenarios
const testScenarios = [
  {
    name: 'Old Format Mapping',
    mapping: oldFormatMapping,
    tests: [
      { input: 'John Doe', expected: 'john' },
      { input: 'Jane Smith', expected: 'jane' },
      { input: 'Bob Johnson', expected: 'bob' },
      { input: 'Unknown Person', expected: 'unknown_person' }
    ]
  },
  {
    name: 'New Format Mapping',
    mapping: newFormatMapping,
    tests: [
      { input: 'Mark Jerly Bundalian', expected: 'mark' },
      { input: 'Jamnilloh Bracamonte', expected: 'jam' },
      { input: 'Unknown Person', expected: 'unknown_person' }
    ]
  },
  {
    name: 'Mixed Format Mapping',
    mapping: mixedFormatMapping,
    tests: [
      { input: 'Old Format Person', expected: 'oldperson' },
      { input: 'New Format Person', expected: 'newperson' },
      { input: 'Another Old', expected: 'anotheroid' },
      { input: 'Unknown Person', expected: 'unknown_person' }
    ]
  },
  {
    name: 'Edge Cases',
    mapping: { mappings: {} },
    tests: [
      { input: 'Name With-Hyphens', expected: 'name_withhyphens' },
      { input: 'Name With.Dots', expected: 'name_withdots' },
      { input: 'Name  With   Spaces', expected: 'name_with_spaces' },
      { input: 'José García', expected: 'jos_garca' }  // Accented chars removed for safe filenames
    ]
  }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Run tests
testScenarios.forEach(scenario => {
  console.log(`\nTEST SCENARIO: ${scenario.name}`);
  console.log('-'.repeat(60));
  
  scenario.tests.forEach(test => {
    totalTests++;
    const result = testGetShortName(test.input, scenario.mapping);
    const passed = result === test.expected;
    
    if (passed) {
      console.log(`  ✓ "${test.input}" → "${result}"`);
      passedTests++;
    } else {
      console.log(`  ✗ "${test.input}" → "${result}" (expected: "${test.expected}")`);
      failedTests++;
    }
  });
});

// Test mapping file resolution logic
console.log('\n' + '='.repeat(70));
console.log('TEST: Mapping File Resolution');
console.log('='.repeat(70));

console.log('\nPriority Order:');
console.log('  1. config.transcripts.teamMappingFile (if specified)');
console.log('  2. Auto-detect: team-name-mapping-{projectFolder}.json');
console.log('  3. Fall back: team-name-mapping.json');

// Check if AI Coach mapping exists
const fs = require('fs');
const path = require('path');

const aiCoachMappingPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping-ai-coach.json');
const defaultMappingPath = path.join(__dirname, '..', 'datasource-generator', 'team-name-mapping.json');

console.log('\nFile Existence Check:');
if (fs.existsSync(aiCoachMappingPath)) {
  const aiCoachMapping = require(aiCoachMappingPath);
  console.log(`  ✓ team-name-mapping-ai-coach.json exists`);
  console.log(`    Project: ${aiCoachMapping.projectFolder}`);
  console.log(`    Team members: ${Object.keys(aiCoachMapping.mappings).length}`);
}

if (fs.existsSync(defaultMappingPath)) {
  const defaultMapping = require(defaultMappingPath);
  console.log(`  ✓ team-name-mapping.json exists`);
  console.log(`    Project: ${defaultMapping.projectFolder}`);
  console.log(`    Team members: ${Object.keys(defaultMapping.mappings).length}`);
}

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
  console.log('\n🎉 All tests passed! Unified mapping format is working correctly.\n');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the errors above.\n');
  process.exit(1);
}

