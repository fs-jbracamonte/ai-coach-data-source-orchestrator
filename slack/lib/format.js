/**
 * Slack Markdown Formatting Helpers
 * 
 * Converts Slack messages to readable Markdown format:
 * - Normalizes Slack markup (mentions, links, code blocks)
 * - Groups messages by date
 * - Formats threads and reactions
 * - Handles attachments and files
 */

/**
 * Normalize Slack markup to Markdown (with optional user mention resolution)
 * - <@U123> or <@U123|label> → @Real Name (if userMap provided) else @U123
 * - <#C123|channel-name> → #channel-name
 * - <https://example.com|link text> → [link text](https://example.com)
 * - :emoji: → :emoji: (kept as-is)
 * - ```code``` → ```code``` (kept as-is)
 * - `code` → `code` (kept as-is)
 */
function normalizeSlackMarkup(text, userMap = undefined) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text;

  // Convert user mentions using map when available
  // Handle both <@U123> and <@U123|label>
  normalized = normalized.replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_, uid) => {
    if (userMap && userMap[uid]) return `@${userMap[uid]}`;
    return `@${uid}`;
  });

  // Convert channel mentions: <#C123|channel-name> → #channel-name
  normalized = normalized.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

  // Convert URLs with labels: <https://example.com|label> → [label](https://example.com)
  normalized = normalized.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');

  // Convert plain URLs: <https://example.com> → https://example.com
  normalized = normalized.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // Slack uses *bold* and _italic_ which match Markdown
  // Keep code blocks and inline code as-is (they're already Markdown-compatible)

  return normalized;
}

/**
 * Format timestamp as HH:MM
 */
function formatTime(ts) {
  if (!ts) return '??:??';
  
  const timestamp = parseFloat(ts) * 1000;
  const date = new Date(timestamp);
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

/**
 * Format timestamp as YYYY-MM-DD
 */
function formatDate(ts) {
  if (!ts) return 'Unknown Date';
  
  const timestamp = parseFloat(ts) * 1000;
  const date = new Date(timestamp);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format reactions array to compact string
 * Example: [{name: "rocket", count: 3}, {name: "tada", count: 1}] → ":rocket:x3, :tada:x1"
 */
function formatReactions(reactions) {
  if (!reactions || !Array.isArray(reactions) || reactions.length === 0) {
    return null;
  }

  return reactions
    .map(r => `:${r.name}:x${r.count}`)
    .join(', ');
}

/**
 * Format file/attachment information
 */
function formatAttachment(file) {
  if (!file) return null;

  const name = file.name || file.title || 'file';
  const mimetype = file.mimetype || '';
  const size = file.size ? formatFileSize(file.size) : '';
  
  // Check if it's a GIF
  if (mimetype.includes('image/gif') || name.toLowerCase().endsWith('.gif')) {
    const dimensions = (file.original_w && file.original_h) 
      ? `${file.original_w}x${file.original_h}` 
      : '';
    return `gif: ${name}${dimensions ? ` (${dimensions})` : ''}`;
  }

  // Check if it's an image
  if (mimetype.startsWith('image/')) {
    const dimensions = (file.original_w && file.original_h) 
      ? `${file.original_w}x${file.original_h}` 
      : '';
    return `image: ${name}${dimensions ? ` (${dimensions})` : ''}`;
  }

  // Other files
  return `file: ${name}${size ? ` (${size})` : ''}`;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format a single message to Markdown
 */
function formatMessage(message, options = {}) {
  const { includeReactions = true, userMap = {} } = options;
  
  const time = formatTime(message.ts);
  const user = message.user || message.username || message.bot_id || 'Unknown';
  const displayName = userMap[user] || user;
  
  // Main message text
  let text = normalizeSlackMarkup(message.text || '', userMap);
  
  // Handle thread indicator
  const threadCount = message.reply_count || 0;
  const threadIndicator = threadCount > 0 ? ` (thread replies: ${threadCount})` : '';
  
  const isMultiline = /\n/.test(text) || /```/.test(text);
  const lines = [];
  if (isMultiline) {
    // Header only
    lines.push(`- ${time} ${displayName}${threadIndicator}:`);
    // Choose fence: use ```text by default; if body contains triple backticks, use four backticks
    const usesTriple = /```/.test(text);
    const fenceStart = usesTriple ? '````' : '```text';
    const fenceEnd = usesTriple ? '````' : '```';
    lines.push(`  ${fenceStart}`);
    // Add body as-is (already normalized)
    text.split('\n').forEach(line => {
      lines.push(`  ${line}`);
    });
    lines.push(`  ${fenceEnd}`);
  } else {
    // Single-line inline
    lines.push(`- ${time} ${displayName}${threadIndicator}: ${text}`);
  }
  
  // Add reactions if present
  if (includeReactions && message.reactions) {
    const reactionsStr = formatReactions(message.reactions);
    if (reactionsStr) {
      lines.push(`  - reactions: ${reactionsStr}`);
    }
  }
  
  // Add file/attachment info
  if (message.files && Array.isArray(message.files)) {
    message.files.forEach(file => {
      const fileStr = formatAttachment(file);
      if (fileStr) {
        lines.push(`  - ${fileStr}`);
      }
    });
  }
  
  // Handle attachments (unfurled links, etc.)
  if (message.attachments && Array.isArray(message.attachments)) {
    message.attachments.forEach(attachment => {
      // For image URLs in attachments
      if (attachment.image_url) {
        const isGif = attachment.image_url.toLowerCase().includes('.gif');
        if (isGif) {
          lines.push(`  - gif: ${attachment.image_url}`);
        }
      }
    });
  }

  return lines.join('\n');
}

/**
 * Format thread replies
 */
function formatThreadReplies(replies, options = {}) {
  const { includeReactions = true, userMap = {} } = options;
  
  const lines = [];
  
  replies.forEach(reply => {
    const time = formatTime(reply.ts);
    const user = reply.user || reply.username || reply.bot_id || 'Unknown';
    const displayName = userMap[user] || user;
    const text = normalizeSlackMarkup(reply.text || '', userMap);

    const isMultiline = /\n/.test(text) || /```/.test(text);
    if (isMultiline) {
      lines.push(`  - ↳ ${time} ${displayName}:`);
      const usesTriple = /```/.test(text);
      const fenceStart = usesTriple ? '````' : '```text';
      const fenceEnd = usesTriple ? '````' : '```';
      lines.push(`    ${fenceStart}`);
      text.split('\n').forEach(line => { lines.push(`    ${line}`); });
      lines.push(`    ${fenceEnd}`);
    } else {
      lines.push(`  - ↳ ${time} ${displayName}: ${text}`);
    }

    if (includeReactions && reply.reactions) {
      const reactionsStr = formatReactions(reply.reactions);
      if (reactionsStr) {
        lines.push(`    - reactions: ${reactionsStr}`);
      }
    }
  });
  
  return lines.join('\n');
}

/**
 * Group messages by date
 */
function groupMessagesByDate(messages) {
  const groups = {};
  
  messages.forEach(message => {
    const date = formatDate(message.ts);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  });
  
  // Sort dates
  const sortedDates = Object.keys(groups).sort();
  
  return sortedDates.map(date => ({
    date,
    messages: groups[date]
  }));
}

/**
 * Convert messages to Markdown
 */
function messagesToMarkdown(messages, channelName, startDate, endDate, options = {}) {
  const { includeReactions = true, includeThreads = true, userMap = {} } = options;
  
  // Group by date
  const dateGroups = groupMessagesByDate(messages);
  
  let markdown = `## Slack: ${channelName} (${startDate} → ${endDate})\n\n`;
  
  dateGroups.forEach(group => {
    markdown += `### ${group.date}\n`;
    
    // Sort messages by timestamp within the day
    const sortedMessages = group.messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    
    sortedMessages.forEach(message => {
      // Skip thread replies (they're attached to parent)
      if (message.thread_ts && message.thread_ts !== message.ts) {
        return;
      }
      
      // Format main message
      markdown += formatMessage(message, { includeReactions, userMap }) + '\n';
      
      // Add thread replies if present
      if (includeThreads && message.replies && Array.isArray(message.replies)) {
        const threadReplies = formatThreadReplies(message.replies, { includeReactions, userMap });
        if (threadReplies) {
          markdown += threadReplies + '\n';
        }
      }
    });
    
    markdown += '\n';
  });
  
  return markdown;
}

module.exports = {
  normalizeSlackMarkup,
  formatTime,
  formatDate,
  formatReactions,
  formatAttachment,
  formatMessage,
  formatThreadReplies,
  groupMessagesByDate,
  messagesToMarkdown
};


