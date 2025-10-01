const fs = require('fs');
const path = require('path');
const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');
const { extractParticipantsFromFile } = require('../transcripts/transcript-to-markdown');

// Test the transcript converter with a sample transcript
const sampleTranscript = `0:00 - John Smith
  Welcome everyone to today's meeting about the project update.
  
0:15 - Jane Doe
  Thanks John. I'd like to start by discussing our progress on the frontend development.
  We've completed the main dashboard and user authentication features.
  
0:45 - John Smith
  That's great to hear. How about the API integration?
  
1:00 - Jane Doe
  The API integration is about 80% complete. We're still working on error handling and some edge cases.`;

// Test with different filename formats
const testFilenames = [
  'fathom-transcript-meeting_09_18_25.txt',
  'transcript_2025-09-18.txt',
  'September 18, 2025 Team Meeting.txt',
  'meeting-notes-09-18-2025.txt'
];

console.log('Testing Transcript to Markdown Converter\n');
console.log('=' .repeat(50));

testFilenames.forEach((filename) => {
  console.log(`\nTesting with filename: ${filename}`);
  console.log('-'.repeat(40));
  
  const markdown = transcriptToMarkdown.convertToMarkdown(sampleTranscript, filename);
  
  // Show first few lines of the output
  const lines = markdown.split('\n');
  console.log('Output preview:');
  lines.slice(0, 8).forEach(line => console.log(`  ${line}`));
  console.log('  ...');
});

// Test participant extraction
console.log('\n' + '='.repeat(50));
console.log('Testing participant extraction:');
console.log('-'.repeat(40));

const participants = transcriptToMarkdown.extractParticipants(sampleTranscript);
console.log(`\nExtracted ${participants.length} participants:`);
participants.forEach(p => console.log(`  - ${p}`));

// Test convertToMarkdown with manual participants
console.log('\n' + '='.repeat(50));
console.log('Testing convertToMarkdown with participants:');
console.log('-'.repeat(40));

const manualParticipants = ['Alice Johnson', 'Bob Williams', 'Charlie Brown'];
const markdownWithParticipants = transcriptToMarkdown.convertToMarkdown(
  sampleTranscript,
  'test-meeting-2025-09-18.txt',
  manualParticipants
);

console.log('\nOutput preview (with manual participants):');
const linesWithP = markdownWithParticipants.split('\n');
linesWithP.slice(0, 12).forEach(line => console.log(`  ${line}`));
console.log('  ...');

// Test convertToMarkdownWithParticipants
console.log('\n' + '='.repeat(50));
console.log('Testing convertToMarkdownWithParticipants:');
console.log('-'.repeat(40));

const autoParticipantsMarkdown = transcriptToMarkdown.convertToMarkdownWithParticipants(
  sampleTranscript,
  'test-meeting-2025-09-18.txt'
);

console.log('\nOutput preview (with auto-extracted participants):');
const linesAutoP = autoParticipantsMarkdown.split('\n');
linesAutoP.slice(0, 12).forEach(line => console.log(`  ${line}`));
console.log('  ...');

// Test backward compatibility (without participants)
console.log('\n' + '='.repeat(50));
console.log('Testing backward compatibility (no participants):');
console.log('-'.repeat(40));

const markdownNoParticipants = transcriptToMarkdown.convertToMarkdown(
  sampleTranscript,
  'test-meeting-2025-09-18.txt'
);

console.log('\nOutput preview (backward compatible - no participants):');
const linesNoP = markdownNoParticipants.split('\n');
linesNoP.slice(0, 8).forEach(line => console.log(`  ${line}`));
console.log('  ...');

// Test extractParticipantsFromFile (new helper function)
console.log('\n' + '='.repeat(50));
console.log('Testing extractParticipantsFromFile:');
console.log('-'.repeat(40));

// Create a test transcript file first
const testDir = path.join(__dirname, 'test-files');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

const testFile = path.join(testDir, 'test-transcript_09_18_25.txt');
fs.writeFileSync(testFile, sampleTranscript);

// Test extracting participants from file
const fileParticipants = extractParticipantsFromFile(testFile);
console.log(`\nExtracted ${fileParticipants.length} participants from file:`);
fileParticipants.forEach(p => console.log(`  - ${p}`));

// Test error handling - missing file
console.log('\nTesting error handling (missing file):');
try {
  extractParticipantsFromFile(path.join(testDir, 'non-existent-file.txt'));
  console.log('  ❌ Should have thrown error');
} catch (error) {
  console.log(`  ✓ Error caught: ${error.name}`);
  console.log(`  ✓ Message: ${error.message.substring(0, 50)}...`);
}

// Test error handling - missing path
console.log('\nTesting error handling (missing path):');
try {
  extractParticipantsFromFile();
  console.log('  ❌ Should have thrown error');
} catch (error) {
  console.log(`  ✓ Error caught: ${error.name}`);
  console.log(`  ✓ Message: ${error.message}`);
}

// Test with actual file conversion
console.log('\n' + '='.repeat(50));
console.log('Testing file conversion:');

// Convert the file (backward compatible)
const content = fs.readFileSync(testFile, 'utf8');
const markdown = transcriptToMarkdown.convertToMarkdown(content, path.basename(testFile));
const outputFile = path.join(testDir, 'test-transcript_09_18_25.md');
fs.writeFileSync(outputFile, markdown);

// Convert with participants
const markdownWithP = transcriptToMarkdown.convertToMarkdownWithParticipants(content, path.basename(testFile));
const outputFileWithP = path.join(testDir, 'test-transcript_09_18_25_with_participants.md');
fs.writeFileSync(outputFileWithP, markdownWithP);

console.log(`✓ Created test file: ${testFile}`);
console.log(`✓ Converted to markdown (no participants): ${outputFile}`);
console.log(`✓ Converted to markdown (with participants): ${outputFileWithP}`);
console.log('\nClean up test files:');
console.log('  Remove-Item -Recurse -Force test/test-files/');
