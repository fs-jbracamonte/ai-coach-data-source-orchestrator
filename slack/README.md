# Slack Module

This module downloads Slack channel history and converts it to Markdown format for inclusion in datasource files.

## Features

- Date-range filtered message downloads
- Thread reply support
- Reaction and emoji preservation
- Automatic pagination with rate limit handling
- Markdown conversion with normalized formatting
- Per-project output organization

## Setup

### 1. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Give it a name (e.g., "Data Source Bot") and select your workspace
5. Click "Create App"

### 2. Add Bot Token Scopes

1. In your app settings, go to "OAuth & Permissions"
2. Under "Scopes" → "Bot Token Scopes", add:
   - `channels:history` - Read public channel messages
   - `channels:read` - List public channels
   - `groups:history` - Read private channel messages (if needed)
   - `groups:read` - List private channels (if needed)

### 3. Install App to Workspace

1. Go to "OAuth & Permissions"
2. Click "Install to Workspace"
3. Authorize the app
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 4. Add Bot to Channels

For each channel you want to download:
1. Open the channel in Slack
2. Type `/invite @YourBotName`
3. Or use the channel details menu → Integrations → Add apps

### 5. Configure Environment

Add the bot token to your `.env` file:

```env
# For engagepath team
SLACK_BOT_TOKEN_ENGAGEPATH=xoxb-your-token-here

# For aicoach team
SLACK_BOT_TOKEN_AICOACH=xoxb-your-other-token-here
```

## Configuration

Add a `slack` section to your config file (e.g., `configs/engagepath/config.weekly.json`):

```json
{
  "slack": {
    "botTokenEnv": "SLACK_BOT_TOKEN_ENGAGEPATH",
    "channels": ["eng-team", "C01234567"],
    "includeThreads": true,
    "includeReactions": true,
    "limit": 15,
    "dateFilter": {
      "start_date": "2025-10-01",
      "end_date": "2025-10-07"
    }
  }
}
```

### Configuration Options

- **`botTokenEnv`** (required): Name of the environment variable containing the bot token
- **`channels`** (required): Array of channel IDs or names to download
- **`dateFilter`** (required): Object with `start_date` and `end_date` in YYYY-MM-DD format
- **`includeThreads`** (optional, default `true`): Fetch thread replies
- **`includeReactions`** (optional, default `true`): Include reaction summaries in Markdown
- **`limit`** (optional, default `15`): API page size (1-1000, recommend ≤200 to avoid rate limits)
- **`types`** (optional, default `"public_channel,private_channel"`): Channel types for list command only

## Usage

### List Available Channels

See all channels your bot has access to:

```bash
# Generic
npm run slack:list

# Team-specific
npm run engagepath:slack:list
npm run aicoach:slack:list
```

### Download Messages

Download message history for configured channels:

```bash
# Generic
npm run slack:download

# Team-specific
npm run engagepath:slack:all
npm run aicoach:slack:all
```

### Convert to Markdown

Convert downloaded JSON to Markdown:

```bash
npm run slack:markdown
```

### Run Complete Pipeline

Download and convert in one command:

```bash
# Generic
npm run slack:all

# Team-specific
npm run engagepath:slack:all
npm run aicoach:slack:all
```

### Clean Output

Remove all downloaded data and generated markdown:

```bash
# Clean Slack data only
npm run clean -- --modules slack

# Clean all data for a specific team
npm run clean -- --team rocks

# Clean everything
npm run clean
```

See [docs/CLEANING.md](../docs/CLEANING.md) for more cleaning options.

## Output Structure

```
slack/
├── data/
│   └── {projectFolder}/
│       └── {channelId}/
│           └── history_2025-10-01_2025-10-07.json
└── md-output/
    └── {projectFolder}/
        ├── eng-team_2025-10-01_2025-10-07.md          # raw markdown (not used by generators)
        └── sanitized/
            └── eng-team_2025-10-01_2025-10-07.md      # sanitized markdown (consumed by generators)
```

## Markdown Format

The generated Markdown groups messages by date with the following format:

```markdown
## Slack: eng-team (2025-10-01 → 2025-10-07)

### 2025-10-01
- 09:15 John Doe: Shipments service deployed to prod
  - reactions: :rocket:x3, :tada:x1
- 09:18 Jane Roe (thread replies: 2): Investigating intermittent 500s on /checkout
  - ↳ 09:25 John Doe: Found misconfigured env var; fix rolling out
  - gif: celebration.gif (480x360)

### 2025-10-02
- 13:04 Bot: Daily build passed for web (commit abc123)
```

### Format Details

- **Inline emojis**: Preserved as `:emoji:` syntax
- **Reactions**: Aggregated as `reactions: :emoji:xN, ...`
- **Threads**: Indented with `↳` prefix
- **Links**: Converted to Markdown `[text](url)` format
- **Mentions**: Kept as `@U123` (user ID)
- **GIFs**: Summarized with dimensions when available
- **Files**: Summarized with size when available

## Dashboard Integration

Slack data is automatically included in dashboard datasources when configured. Generators consume only sanitized outputs (fail-closed):

```bash
npm run engagepath:dashboard
npm run aicoach:dashboard
```

The dashboard generator will:
1. Run all prerequisite data collection (daily reports, Jira, transcripts)
2. Download and convert Slack data (if configured)
3. Sanitize Slack markdown (code and secrets redacted) under `md-output/{projectFolder}/sanitized/`
4. Generate a Python datasource file with `SLACK_DATA` built from sanitized files only

If Slack is not configured or fails, the dashboard will still be generated without Slack data.

## Sanitization

By default, Slack markdown is sanitized to remove code and mask secrets:

- Fenced code blocks → `[REDACTED CODE n lines, language=lang]`
- Inline code → `[REDACTED INLINE CODE]`
- Likely secrets (tokens, keys, env lines) → `[REDACTED SECRET]`

Prompt-injection denylist (line-level):
- Configurable via `slack.sanitization.promptDenylistFile` (JSON array file) and/or inline `slack.sanitization.promptDenylist[]` (both merged; case-insensitive)
- Any line containing a listed phrase is replaced by `[REDACTED PROMPT INSTRUCTION]`

Configuration (defaults in `configs/shared/defaults.json`):

```json
{
  "slack": {
    "sanitization": {
      "enable": true,
      "redactCodeBlocks": true,
      "redactInlineCode": true,
      "maskSecrets": true,
      "promptDenylistFile": "configs/shared/prompt-denylist.json",
      "promptDenylist": []
    }
  }
}
```

Notes:
- Generators never read the raw (unsanitized) markdown.
- If sanitized directory is missing/empty, Slack is omitted from the datasource.

## Rate Limiting

The Slack API has rate limits. This module handles them automatically:

- **Retry logic**: Automatically retries on 429 responses with exponential backoff
- **Conservative defaults**: Default `limit=15` to avoid hitting limits
- **Pagination**: Uses cursor-based pagination for efficient data fetching

For non-Marketplace apps (default limit is 1 request/minute for conversations.history):
- Set `limit` to a lower value (e.g., 10-15)
- Process channels sequentially (already done)
- Consider spacing out large downloads

## Troubleshooting

### Bot not seeing channels

**Symptom**: `npm run slack:list` doesn't show expected channels

**Solution**:
1. Ensure bot is invited to the channel: `/invite @BotName`
2. For private channels, bot needs explicit invitation
3. Check bot scopes include `channels:read` and `groups:read`

### Rate limit errors (429)

**Symptom**: "Rate limited" messages during download

**Solution**:
1. Reduce `limit` in config (try 10-15)
2. Wait before retrying
3. Check if other processes are using the same bot token

### Missing messages

**Symptom**: Fewer messages than expected

**Solution**:
1. Verify date range in `dateFilter`
2. Check that bot was added to channel before the messages were sent
3. Ensure bot has appropriate history scopes

### Permission errors (403)

**Symptom**: "Forbidden" or "not_in_channel" errors

**Solution**:
1. Invite bot to the channel
2. Re-install bot to workspace if scopes changed
3. Check that bot has required permissions

## API Documentation

- [Slack conversations.list](https://api.slack.com/methods/conversations.list)
- [Slack conversations.history](https://api.slack.com/methods/conversations.history)
- [Slack conversations.replies](https://api.slack.com/methods/conversations.replies)
- [Slack Bot Tokens](https://api.slack.com/authentication/token-types#bot)


