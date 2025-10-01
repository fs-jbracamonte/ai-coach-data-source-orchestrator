/**
 * Test script to verify enhanced markdown conversion with participants
 * Tests the convertTranscriptToMarkdown logic without requiring Google Drive access
 */

const fs = require('fs');
const path = require('path');
const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');

console.log('====================================================================');
console.log('TEST: Enhanced Markdown Conversion with Participants');
console.log('====================================================================\n');

// Sample transcript content
const sampleTranscript = `0:00 - Alice Johnson
  Welcome to our weekly team sync. Let's start with project updates.
  
0:30 - Bob Smith
  Thanks Alice. I've completed the backend API integration.
  
1:15 - Charlie Davis
  Great work Bob. I'm working on the frontend components.
  
2:00 - Alice Johnson
  Excellent progress team. Let's review the timeline.`;

// Create test directory
const testDir = path.join(__dirname, 'test-download-files');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Test the conversion process (simulating download-from-drive.js logic)
function testConvertTranscriptToMarkdown(txtFilePath, filename, outputDir) {
  try {
    console.log(`\nTesting conversion: ${filename}`);
    console.log('-'.repeat(50));
    
    // Read the transcript content
    const content = fs.readFileSync(txtFilePath, 'utf8');
    console.log('✓ Read transcript content');
    
    // Extract participants from the content
    const participants = transcriptToMarkdown.extractParticipants(content);
    console.log(`✓ Extracted ${participants.length} participants:`);
    participants.forEach(p => console.log(`    - ${p}`));
    
    // Convert to markdown with participants included
    const markdown = transcriptToMarkdown.convertToMarkdown(content, filename, participants);
    console.log('✓ Converted to markdown with participants');
    
    // Generate markdown filename
    const baseName = path.basename(filename, '.txt');
    const markdownFilename = `${baseName}.md`;
    const markdownPath = path.join(outputDir, markdownFilename);
    
    // Write markdown file
    fs.writeFileSync(markdownPath, markdown);
    console.log(`✓ Saved markdown file: ${markdownFilename}`);
    
    // Log conversion with participant count (as in download-from-drive.js)
    const participantInfo = participants.length > 0 ? ` (${participants.length} participants)` : '';
    console.log(`✓ Converted: ${filename} → ${markdownFilename}${participantInfo}`);
    
    // Show preview of markdown
    console.log('\nMarkdown preview (first 15 lines):');
    const lines = markdown.split('\n');
    lines.slice(0, 15).forEach(line => console.log(`  ${line}`));
    if (lines.length > 15) {
      console.log('  ...');
    }
    
    return markdownPath;
  } catch (error) {
    console.error(`✗ Failed to convert ${filename}:`, error.message);
    return null;
  }
}

// Create test transcript file
const testFile = path.join(testDir, 'team-meeting-2025-10-01.txt');
fs.writeFileSync(testFile, sampleTranscript);
console.log('Test Setup:');
console.log(`  Created test file: ${path.basename(testFile)}`);

// Test conversion
const markdownPath = testConvertTranscriptToMarkdown(
  testFile,
  'team-meeting-2025-10-01.txt',
  testDir
);

// Verify the markdown file
if (markdownPath && fs.existsSync(markdownPath)) {
  console.log('\n' + '='.repeat(50));
  console.log('✅ Test PASSED: Markdown file created successfully');
  console.log('='.repeat(50));
  
  // Read and verify participants section exists
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  if (markdown.includes('## Meeting Participants')) {
    console.log('✓ Participants section found in markdown');
    console.log('✓ Enhanced conversion is working correctly');
  } else {
    console.log('⚠ Warning: Participants section not found');
  }
} else {
  console.log('\n' + '='.repeat(50));
  console.log('❌ Test FAILED: Markdown file not created');
  console.log('='.repeat(50));
}

console.log('\nClean up test files:');
console.log('  Remove-Item -Recurse -Force test/test-download-files/');

