const fs = require('fs');
const path = require('path');
const transcriptToMarkdown = require('./transcript-to-markdown');

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

// Test with actual file conversion
console.log('\n' + '='.repeat(50));
console.log('Testing file conversion:');

// Create a test transcript file
const testDir = path.join(__dirname, 'test-files');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

const testFile = path.join(testDir, 'test-transcript_09_18_25.txt');
fs.writeFileSync(testFile, sampleTranscript);

// Convert the file
const content = fs.readFileSync(testFile, 'utf8');
const markdown = transcriptToMarkdown.convertToMarkdown(content, path.basename(testFile));
const outputFile = path.join(testDir, 'test-transcript_09_18_25.md');
fs.writeFileSync(outputFile, markdown);

console.log(`✓ Created test file: ${testFile}`);
console.log(`✓ Converted to markdown: ${outputFile}`);
console.log('\nClean up test files:');
console.log('  rm -rf test-files/');
