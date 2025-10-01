const fs = require('fs');
const path = require('path');
const { FileSystemError } = require('../lib/errors');

class TranscriptToMarkdown {
  /**
   * Converts transcript text content to markdown format
   * @param {string} content - The raw transcript text
   * @param {string} filename - The filename (used to extract date)
   * @param {Array<string>} [participants=null] - Optional array of participant names to display
   * @returns {string} Formatted markdown
   */
  convertToMarkdown(content, filename = '', participants = null) {
    if (!content || content.trim() === '') {
      return '# Transcript\n\nNo transcript data available.';
    }

    // Extract date from filename
    const date = this.extractDateFromFilename(filename);

    let markdown = `# ${date}\n\n`;

    // Add participants section if provided
    if (participants && Array.isArray(participants) && participants.length > 0) {
      markdown += `## Meeting Participants\n\n`;
      for (const participant of participants) {
        markdown += `- ${participant}\n`;
      }
      markdown += `\n`;
    }

    // Process the transcript text
    const processedContent = this.processTranscriptText(content);
    markdown += processedContent;

    // Add footer
    markdown += `\n---\n\n`;
    markdown += `*Transcript processed on ${new Date().toLocaleString()}*\n`;

    return markdown;
  }

  /**
   * Converts transcript text content to markdown format with automatically extracted participants
   * @param {string} content - The raw transcript text
   * @param {string} filename - The filename (used to extract date)
   * @returns {string} Formatted markdown with participant list
   */
  convertToMarkdownWithParticipants(content, filename = '') {
    const participants = this.extractParticipants(content);
    return this.convertToMarkdown(content, filename, participants);
  }

  /**
   * Extracts unique participant names from transcript content
   * @param {string} content - The raw transcript text
   * @returns {Array<string>} Array of unique participant names (preserves original casing)
   */
  extractParticipants(content) {
    if (!content || content.trim() === '') {
      return [];
    }

    const lines = content.split('\n');
    const speakers = new Set();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try to detect if this line is a transcript entry
      const transcriptMatch = this.detectTranscriptLine(trimmedLine);

      if (transcriptMatch && transcriptMatch.speaker) {
        // Add speaker to set (preserves original casing)
        speakers.add(transcriptMatch.speaker);
      }
    }

    // Convert Set to sorted array
    return Array.from(speakers).sort();
  }

  /**
   * Processes raw transcript text and formats it
   * @private
   */
  processTranscriptText(content) {
    const lines = content.split('\n');
    const processedLines = [];
    let currentSpeaker = null;
    let currentContent = [];

    const flushCurrentEntry = () => {
      if (currentSpeaker && currentContent.length > 0) {
        const header = `## ${currentSpeaker.time} - ${currentSpeaker.speaker}`;
        processedLines.push(header);
        processedLines.push(currentContent.join(' ').trim());
        processedLines.push(''); // Empty line for spacing
        currentContent = [];
      }
    };

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try to detect if this line is a transcript entry
      const transcriptMatch = this.detectTranscriptLine(trimmedLine);

      if (transcriptMatch) {
        // Flush any previous entry
        flushCurrentEntry();

        const { time, speaker, content: lineContent } = transcriptMatch;

        if (lineContent) {
          // This pattern has content on the same line
          const header = `## ${time} - ${speaker}`;
          processedLines.push(header);
          processedLines.push(lineContent);
          processedLines.push(''); // Empty line for spacing
        } else {
          // This is a header line, content comes next
          currentSpeaker = { time, speaker };
        }
      } else {
        // This might be content for the current speaker
        if (currentSpeaker) {
          // Check if this looks like indented content
          if (line.startsWith('  ') || line.startsWith('\t')) {
            currentContent.push(trimmedLine);
          } else {
            // Not indented, might be continuation or new content
            currentContent.push(trimmedLine);
          }
        } else {
          // No current speaker, treat as regular content
          processedLines.push(trimmedLine);
        }
      }
    }

    // Flush any remaining entry
    flushCurrentEntry();

    return processedLines.join('\n');
  }

  /**
   * Attempts to detect and parse transcript lines in various formats
   * @private
   */
  detectTranscriptLine(line) {
    // Common transcript patterns:
    // "0:00 - Speaker" (header line)
    // "00:00 Speaker: content"
    // "00:00:00 Speaker: content"
    // "[00:00] Speaker: content"
    // "Speaker (00:00): content"
    // "Speaker: content" (without timestamp)

    const patterns = [
      // Pattern: "0:00 - Speaker" (header line format)
      /^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+)$/,
      // Pattern: "00:00 Speaker: content" or "00:00:00 Speaker: content"
      /^(\d{1,2}:\d{2}(?::\d{2})?)\s+([^:]+):\s*(.+)$/,
      // Pattern: "[00:00] Speaker: content"
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s*(.+)$/,
      // Pattern: "Speaker (00:00): content"
      /^([^(]+)\s*\((\d{1,2}:\d{2}(?::\d{2})?)\):\s*(.+)$/,
      // Pattern: "Speaker: content" (no timestamp)
      /^([^:]+):\s*(.+)$/,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = line.match(pattern);
      if (match) {
        if (i === 0) {
          // "0:00 - Speaker" format - header line, content comes next
          return {
            time: this.formatTime(match[1]),
            speaker: match[2].trim(),
            content: '', // Content will be on next line(s)
          };
        } else if (i === 1 || i === 2) {
          // Time first patterns with content
          return {
            time: this.formatTime(match[1]),
            speaker: match[2].trim(),
            content: match[3].trim(),
          };
        } else if (i === 3) {
          // Speaker (time) pattern
          return {
            time: this.formatTime(match[2]),
            speaker: match[1].trim(),
            content: match[3].trim(),
          };
        } else if (i === 4) {
          // Speaker: content (no time)
          return {
            time: '',
            speaker: match[1].trim(),
            content: match[2].trim(),
          };
        }
      }
    }

    return null;
  }

  /**
   * Extracts date from filename in various formats
   * @private
   */
  extractDateFromFilename(filename) {
    if (!filename) {
      return new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Remove file extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Normalize separators to spaces
    const normalized = nameWithoutExt
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try to find date patterns
    let match;

    // Pattern: Month name with day and year
    const monthNamePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i;
    match = normalized.match(monthNamePattern);
    if (match) {
      const month = this.getMonthNumber(match[1]);
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Pattern: YYYY-MM-DD or YYYY_MM_DD
    match = normalized.match(/(\d{4})[\-_ ](\d{1,2})[\-_ ](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Pattern: MM-DD-YYYY or MM_DD_YYYY
    match = normalized.match(/(\d{1,2})[\-_ ](\d{1,2})[\-_ ](\d{4})/);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Pattern: MM_DD_YY format (e.g., "09_18_25")
    match = normalized.match(/(\d{2})[\-_ ](\d{2})[\-_ ](\d{2})/);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      
      // Convert 2-digit year to 4-digit
      // Assume 20xx for years 00-50, 19xx for 51-99
      if (year <= 50) {
        year += 2000;
      } else {
        year += 1900;
      }
      
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Fallback: use filename or current date
    return nameWithoutExt || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Converts month name to number
   * @private
   */
  getMonthNumber(monthName) {
    const months = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    };
    return months[monthName.toLowerCase()] || 1;
  }

  /**
   * Formats time to H:MM format
   * @private
   */
  formatTime(timeValue) {
    if (!timeValue) return '0:00';

    // If it's already in HH:MM or HH:MM:SS format
    if (timeValue.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
      const parts = timeValue.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      return `${hours}:${minutes}`;
    }

    // If it's a number (seconds)
    if (!isNaN(parseFloat(timeValue))) {
      const totalSeconds = Math.floor(parseFloat(timeValue));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    return '0:00'; // Default fallback
  }
}

/**
 * Standalone helper function to extract participants from a transcript file
 * Useful for filtering transcripts before full conversion
 * 
 * @param {string} filePath - Path to the transcript file (.txt)
 * @returns {Array<string>} Array of unique participant names
 * @throws {FileSystemError} If file cannot be read
 * 
 * @example
 * const participants = extractParticipantsFromFile('./transcript.txt');
 * // Returns: ["Alice", "Bob", "Charlie"]
 */
function extractParticipantsFromFile(filePath) {
  if (!filePath) {
    throw new FileSystemError(
      'File path is required for participant extraction',
      {
        operation: 'read',
        resolutionSteps: [
          'Provide a valid file path to the transcript file',
          'Example: extractParticipantsFromFile("./transcripts/meeting.txt")'
        ]
      }
    );
  }

  // Resolve the file path
  const resolvedPath = path.resolve(filePath);

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new FileSystemError(
      `Transcript file not found: ${filePath}`,
      {
        operation: 'read',
        filePath: resolvedPath,
        resolutionSteps: [
          'Check that the file path is correct',
          'Verify the file exists at the specified location',
          'Ensure the file has not been moved or deleted'
        ]
      }
    );
  }

  try {
    // Read the file content
    const content = fs.readFileSync(resolvedPath, 'utf8');
    
    // Use the TranscriptToMarkdown instance to extract participants
    const transcriptConverter = new TranscriptToMarkdown();
    return transcriptConverter.extractParticipants(content);
  } catch (error) {
    // If it's already a FileSystemError, re-throw it
    if (error instanceof FileSystemError) {
      throw error;
    }

    // Wrap other errors in FileSystemError
    throw new FileSystemError(
      `Failed to read or parse transcript file: ${filePath}`,
      {
        operation: 'read',
        filePath: resolvedPath,
        originalError: error.message,
        resolutionSteps: [
          'Check file permissions (file must be readable)',
          'Verify the file is a valid text file',
          'Ensure the file is not corrupted',
          'Check that the file contains valid transcript format'
        ]
      }
    );
  }
}

// Export both the TranscriptToMarkdown instance and the helper function
const transcriptToMarkdown = new TranscriptToMarkdown();

module.exports = transcriptToMarkdown;
module.exports.extractParticipantsFromFile = extractParticipantsFromFile;
module.exports.TranscriptToMarkdown = TranscriptToMarkdown;
