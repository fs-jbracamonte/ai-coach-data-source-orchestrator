#!/usr/bin/env node
const assert = require('assert');

(async () => {
  const { sanitizeMarkdown } = require('../slack/lib/sanitizer');

  const md = [
    'Here is a code block:',
    '```python',
    'print("hello")',
    'print("world")',
    '```',
    '',
    'Inline like `rm -rf /` should be redacted.',
    '',
    'Token xoxb-1234567890-ABCDEFG should be masked.',
    'DB_PASSWORD=supersecret',
    '-----BEGIN PRIVATE KEY-----',
    'abc',
    '-----END PRIVATE KEY-----'
  ].join('\n');

  const out = await sanitizeMarkdown(md, { useSecretlint: false });

  assert(out.includes('[REDACTED CODE 2 lines, language=python]'));
  assert(out.includes('[REDACTED INLINE CODE]'));
  assert(!out.includes('xoxb-'));
  assert(out.includes('[REDACTED SECRET]'));
  assert(out.includes('[REDACTED SECRET KEY BLOCK]'));

  console.log('✓ sanitizer basic tests passed');
})();



