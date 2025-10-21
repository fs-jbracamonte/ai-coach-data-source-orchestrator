const { spawnSync } = require('child_process');

/**
 * Sanitizes Slack markdown by:
 * 1) Redacting fenced and inline code via remark AST
 * 2) Masking likely secrets via regex heuristics (and optional Secretlint CLI)
 *
 * Note: remark/unified are ESM; we import them dynamically.
 */

async function loadMarkdownTooling() {
  const unifiedMod = await import('unified');
  const remarkParseMod = await import('remark-parse');
  const remarkStringifyMod = await import('remark-stringify');
  const visitMod = await import('unist-util-visit');
  return {
    unified: unifiedMod.unified,
    remarkParse: remarkParseMod.default,
    remarkStringify: remarkStringifyMod.default,
    visit: visitMod.visit
  };
}

function classifyBlockContent(value, lang) {
  const text = (value || '').slice(0, 5000);
  const lower = text.toLowerCase();
  const firstLines = text.split('\n').slice(0, 5).join('\n');

  const langLower = (lang || '').toLowerCase();
  const shellLangs = new Set(['bash', 'shell', 'sh', 'zsh', 'ps1', 'powershell', 'cmd']);
  const codeLangs = new Set(['js', 'javascript', 'ts', 'typescript', 'py', 'python', 'java', 'go', 'ruby', 'php', 'c', 'cpp', 'csharp', 'cs', 'json', 'yaml', 'yml', 'toml', 'sql', 'kotlin', 'swift']);

  // If language hint is shell
  if (shellLangs.has(langLower)) return 'command';
  // If language hint is a programming/config language
  if (codeLangs.has(langLower)) return 'code';

  // Heuristics: command lines
  const commandPatterns = [
    /^\s*[$>#] /m,
    /\b(npm|pnpm|yarn)\s+(run\s+)?[a-z0-9:_-]+/i,
    /\b(git|curl|wget|tar|zip|unzip|chmod|chown|scp|ssh)\b/i,
    /\b(docker|kubectl|helm|terraform|gcloud|aws|az)\b/i,
    /\b(systemctl|service|brew|apt|yum|dnf|pip|pip3|python|node)\b/i,
    /^\s*(dir|copy|del|type)\s+/mi
  ];
  if (commandPatterns.some((re) => re.test(text))) return 'command';

  // Heuristics: stack traces
  const stackPatterns = [
    /traceback \(most recent call last\)/i, // Python
    /^\s*at\s+\S+\s+\(.+\)$/m,           // JS/Node
    /Exception in thread /,                  // Java
    /\bCaused by:/
  ];
  if (stackPatterns.some((re) => re.test(firstLines) || re.test(text))) return 'stacktrace';

  // Heuristics: error logs
  const errorPatterns = [
    /\berror\b[:\s]/i,
    /npm ERR!/i
  ];
  if (errorPatterns.some((re) => re.test(firstLines) || re.test(text))) return 'error_log';

  // Heuristics: generic logs
  const logPatterns = [
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}.*\b(ERROR|WARN|INFO|DEBUG|TRACE)\b/m,
    /^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+\[/m, // syslog-ish
    /level=(info|warn|error|debug)/i
  ];
  if (logPatterns.some((re) => re.test(firstLines) || re.test(text))) return 'log';

  // Heuristics: configuration
  const isLikelyJson = (text.match(/"[A-Za-z0-9_.-]+"\s*:\s*/g) || []).length >= 3;
  const yamlKeyLines = (text.match(/^\s*[A-Za-z0-9_.-]+\s*:\s*.+$/gm) || []).length;
  const hasK8s = /\bapiVersion:\b|\bkind:\b|\bmetadata:\b/.test(text);
  const commonConfigWords = /(^|\b)(config|configuration|settings|version|name|dependencies|scripts|env)(\b|:)/i.test(text);
  if (isLikelyJson || yamlKeyLines >= 3 || hasK8s || commonConfigWords) return 'config';

  // Fallback
  return 'code';
}

function createRemarkRedactCodePlugin(visit, options = {}) {
  const redactBlocks = options.redactCodeBlocks !== false;
  const redactInline = options.redactInlineCode !== false;

  return () => (tree) => {
    visit(tree, ['code', 'inlineCode'], (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (node.type === 'code' && redactBlocks) {
        const lines = (node.value || '').split('\n').length;
        const lang = node.lang || 'plain';
        const kind = classifyBlockContent(node.value || '', lang);
        parent.children[index] = { type: 'text', value: `[REDACTED CODE ${lines} lines, language=${lang}, kind=${kind}]` };
      } else if (node.type === 'inlineCode' && redactInline) {
        const kind = classifyBlockContent(node.value || '', node.lang || '');
        parent.children[index] = { type: 'text', value: `[REDACTED INLINE CODE, kind=${kind}]` };
      }
    });
  };
}

function maskSecretsHeuristics(text) {
  if (!text) return text;
  let out = text;
  // Private key blocks
  out = out.replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED SECRET KEY BLOCK]');
  // Slack tokens
  out = out.replace(/xox(?:p|b|o|a|r|s)-[A-Za-z0-9-]+/g, '[REDACTED SECRET]');
  // AWS Access Keys (AKIA/ASIA)
  out = out.replace(/A[KS]IA[0-9A-Z]{16}/g, '[REDACTED SECRET]');
  // Common credential params
  out = out.replace(/\b(access[-_]?token|token|auth|authorization|password|passwd|pwd|apikey|api[_-]?key)[=:]\s*([A-Za-z0-9._~+\/-]|=){6,}/gi,
    (m, k) => `${k}=[REDACTED SECRET]`);
  // ENV style KEY=VALUE with uppercase keys
  out = out.replace(/\b[A-Z][A-Z0-9_]{1,48}\s*=\s*[^\s"']+/g, (m) => {
    const key = m.split('=')[0].trim();
    return `${key}=[REDACTED SECRET]`;
  });
  return out;
}

function maskSecretsWithSecretlint(text) {
  try {
    const res = spawnSync('npx', ['--yes', 'secretlint', '--stdin', '--format', 'json'], {
      input: text,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024
    });
    if (res.status !== 0 || !res.stdout) {
      return text; // fallback silently
    }
    const json = JSON.parse(res.stdout);
    // json is an array of results; collect ranges per message
    // We will conservatively redact entire matched lines
    let out = text;
    if (Array.isArray(json)) {
      // Build a set of line numbers to redact
      const lines = new Set();
      json.forEach((fileRes) => {
        (fileRes.messages || []).forEach((msg) => {
          if (msg.loc && typeof msg.loc.start === 'object') {
            lines.add(msg.loc.start.line);
          }
        });
      });
      if (lines.size > 0) {
        const outLines = out.split('\n').map((ln, i) => (lines.has(i + 1) ? '[REDACTED SECRET]' : ln));
        out = outLines.join('\n');
      }
    }
    return out;
  } catch (_) {
    return text;
  }
}

async function sanitizeMarkdown(markdown, options = {}) {
  const { unified, remarkParse, remarkStringify, visit } = await loadMarkdownTooling();
  const remarkRedactCodePlugin = createRemarkRedactCodePlugin(visit, options);

  // Redact code and inline code
  const redacted = String(
    await unified().use(remarkParse).use(remarkRedactCodePlugin).use(remarkStringify).process(markdown)
  );

  // Mask secrets (heuristics first)
  let masked = options.maskSecrets === false ? redacted : maskSecretsHeuristics(redacted);

  // Prompt-injection denylist (line-level)
  if (Array.isArray(options.promptDenylist) && options.promptDenylist.length > 0) {
    const patterns = options.promptDenylist
      .filter(s => typeof s === 'string' && s.trim().length > 0)
      .map(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    if (patterns.length) {
      masked = masked
        .split('\n')
        .map(line => patterns.some(re => re.test(line)) ? '[REDACTED PROMPT INSTRUCTION]' : line)
        .join('\n');
    }
  }

  // Optionally try Secretlint CLI for extra coverage
  if (options.useSecretlint) {
    masked = maskSecretsWithSecretlint(masked);
  }

  return masked;
}

module.exports = {
  sanitizeMarkdown,
  createRemarkRedactCodePlugin,
  maskSecretsHeuristics
};


