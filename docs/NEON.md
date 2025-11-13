# Neon Database Integration with Drizzle ORM

## Overview

The Data Source Orchestrator integrates with Neon PostgreSQL database using **Drizzle ORM** for type-safe, production-ready database operations.

### Key Features

✅ **Type-Safe Queries** - Full TypeScript support with autocomplete  
✅ **Automatic Migrations** - Schema-driven migrations with Drizzle Kit  
✅ **Built-in Seeding** - Automated seeding with UUID caching  
✅ **Production-Ready** - Works in any Node.js environment  
✅ **Multi-Environment** - Supports dev/staging/prod  
✅ **Feature-Flag Controlled** - Hidden behind `ENABLE_NEON_DB_STORAGE`  

## Architecture

### Technology Stack

- **Drizzle ORM** - Type-safe query builder and ORM
- **Drizzle Kit** - CLI tools for migrations and schema management
- **@neondatabase/serverless** - Neon's HTTP-based PostgreSQL driver
- **drizzle-orm/neon-http** - Drizzle adapter for Neon

### Database Schema

Defined in `db/schema.ts`:

1. **organizations** - Client organizations (Full Scale, Full Scale Ventures)
2. **teams** - Projects within organizations
3. **daily_reports** - Daily report entries (one per employee per day)
4. **meeting_transcripts** - Meeting transcript files
5. **jira_snapshots** - Weekly Jira data (blob references)
6. **slack_captures** - Weekly Slack data (blob references)
7. **report_types** - Report type lookup (1on1, dashboard, weekly-digest)
8. **generated_reports** - Datasource.py metadata (future use)
9. **report_data_links** - Links reports to source data (future use)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `drizzle-orm` - ORM runtime
- `drizzle-kit` - Migration tools (dev dependency)
- `drizzle-seed` - Seeding library

### 2. Configure Environment

Add to `.env`:

```bash
# Neon Database
ENABLE_NEON_DB_STORAGE=true
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEON_ENV=dev

# Vercel Blob (required for Neon)
ENABLE_VERCEL_BLOB_UPLOAD=true
BLOB_READ_WRITE_TOKEN=your_token_here
```

### 3. Push Schema to Database

For a **fresh database** (recommended):

```bash
npm run db:push
```

This:
- Reads the TypeScript schema from `db/schema.ts`
- Creates all tables, indexes, and constraints
- No migration files generated (faster for initial setup)

### 4. Seed the Database

```bash
npm run db:seed
```

This:
- Inserts organizations (Full Scale, Full Scale Ventures)
- Inserts teams (rocks, timeclock, engagepath, ai-coach)
- Inserts report types (1on1, dashboard, weekly-digest)
- Automatically creates `.neon-db-ids.dev.json` with UUIDs

### 5. Verify Setup

```bash
npm run db:query
```

Shows:
- Organizations and teams
- Report types
- Data counts (daily reports, transcripts, etc.)

## Commands Reference

### Schema Management

```bash
# Push schema to database (no migration files)
npm run db:push

# Generate migration files from schema changes
npm run db:generate

# Apply generated migrations programmatically
npm run db:migrate

# Pull existing schema from database
npm run db:pull
```

### Data Management

```bash
# Seed organizations, teams, report types
npm run db:seed

# Query database to verify data
npm run db:query
```

### Development Tools

```bash
# Open Drizzle Studio (GUI for browsing data)
npm run db:studio
```

## Drizzle Studio

Drizzle Studio is a web-based GUI for viewing and editing your database:

```bash
npm run db:studio
```

Opens at http://localhost:4983 with:
- Visual table browser
- Query editor
- Data editing capabilities
- Useful for debugging and verification

## Migration Workflow

### Initial Setup (Fresh Database)

Use `db:push` for the fastest setup:

```bash
npm run db:push     # Creates all tables
npm run db:seed     # Seeds initial data
```

### Schema Changes (After Initial Setup)

For tracked migrations:

```bash
# 1. Update db/schema.js with your changes
# 2. Generate migration files
npm run db:generate

# 3. Apply migrations
npm run db:migrate
```

## Adding New Tables or Columns

### Step-by-Step Workflow

**1. Update the Schema**

Edit `db/schema.js` and add your new table:

```javascript
// Example: Add a new "projects" table
const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  teamIdIdx: index('idx_projects_team_id').on(table.teamId),
}));

// Don't forget to export it!
module.exports = {
  organizations,
  teams,
  dailyReports,
  // ... existing exports ...
  projects,  // ← Add new table to exports
};
```

**2. Generate Migration**

```bash
npm run db:generate
```

This creates a new migration file: `drizzle/0001_some_name.sql`

**3. Review the Migration**

Check the generated SQL in `drizzle/0001_*.sql` to ensure it's correct.

**4. Apply Migration**

**Development:**
```bash
npm run db:push  # Direct sync (faster)
```

**Production:**
```bash
npm run db:migrate  # Apply tracked migrations
```

**5. Verify**

```bash
npm run db:query
# Or visually:
npm run db:studio
```

### Modifying Existing Tables

Same workflow - just edit the table definition in `db/schema.js`:

```javascript
// Add a new column to existing table
const teams = pgTable('teams', {
  // ... existing columns ...
  isActive: boolean('is_active').notNull().default(true),  // ← New column
});
```

Then run `npm run db:generate` to create the ALTER TABLE migration.

### Migration vs Push

- **`db:push`** - Direct sync, no migration files, fast iteration (best for development)
- **`db:generate` + `db:migrate`** - Creates migration files, version controlled (best for production)

**For production workflow:**
1. Generate migrations locally: `npm run db:generate`
2. Commit migration files to git: `drizzle/0001_*.sql`
3. Apply in production: `npm run db:migrate`

### No Automatic Rollbacks

⚠️ **Important**: Drizzle does not have automatic "down" migrations.

**Rollback strategies:**

1. **Manual Reverse Migrations**
   - Create new migration that reverses the change
   - Example: Added column? Create migration to drop it

2. **Neon Branching**
   - Test schema changes on a Neon branch first
   - Only apply to main if tests pass

3. **Neon Point-in-Time Recovery**
   - Restore database to specific timestamp
   - Use for critical failures

## How Data is Stored

### Storage Flow

1. **Generate datasource.py** (normal workflow)
2. **Upload to Vercel Blob** (with SHA-256 checksums)
3. **Store to Neon** (if enabled):
   - Parse markdown files
   - Extract metadata (dates, authors, filenames)
   - Match blob references from Vercel results
   - Execute Drizzle insert/update queries
   - Report counts to console

### Daily Reports

- Split by `## Date` headers
- One row per employee per day
- Extract author from `**Employee**: Name`
- Store markdown content inline + blob reference
- Deduplication: `(project_id, author_name, report_date)`

### Meeting Transcripts

- One row per transcript file
- Parse date from filename
- Store full text inline + blob reference
- Deduplication: `(project_id, filename, transcript_date)`

### Jira Snapshots

- One row per week
- Blob reference only (points to epic_tree markdown)
- Uses config date range for week start/end
- No deduplication

### Slack Captures

- One row per channel per week
- Blob reference only (points to sanitized markdown)
- Uses config date range for week start/end
- No deduplication

## Multi-Environment Support

Use different `NEON_ENV` values for different Neon instances:

```bash
# Development
NEON_ENV=dev npm run db:seed
# Creates .neon-db-ids.dev.json

# Staging
NEON_ENV=staging npm run db:push
NEON_ENV=staging npm run db:seed
# Creates .neon-db-ids.staging.json

# Production
NEON_ENV=prod npm run db:push
NEON_ENV=prod npm run db:seed
# Creates .neon-db-ids.prod.json
```

Each environment has its own UUID cache file.

## Troubleshooting

### "DATABASE_URL not configured"

**Solution**: Add `DATABASE_URL` to `.env`:
```bash
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

Get from: Neon Console → Project → Connection Details

### "Vercel Blob upload is not enabled"

**Solution**: Neon storage requires Vercel upload (stores blob references):
```bash
ENABLE_VERCEL_BLOB_UPLOAD=true
BLOB_READ_WRITE_TOKEN=your_token
```

### "Could not find project UUID"

**Solution**: Run the seed script:
```bash
npm run db:seed
```

Verify `.neon-db-ids.dev.json` exists and contains team UUIDs.

### Migration Errors

**For fresh database**: Use `npm run db:push` instead of `db:migrate`

**For schema conflicts**: 
1. Pull current schema: `npm run db:pull`
2. Review conflicts
3. Update `db/schema.ts`
4. Push again: `npm run db:push`

### Connection Errors

1. Verify `DATABASE_URL` format
2. Check Neon Console → Monitoring
3. Test connection: `npm run db:query`
4. Enable debug: `DEBUG=true npm run db:query`

## File Structure

```
data-source-orchestrator/
├── db/
│   ├── schema.ts              # Drizzle schema definition
│   └── client.ts              # Drizzle client configuration
├── drizzle/                   # Generated migrations (if using generate)
│   ├── meta/                  # Migration metadata
│   └── *.sql                  # Migration SQL files
├── migrations/                # Legacy SQL migrations (kept for reference)
│   ├── 001_initial_schema.sql
│   └── 002_updated_at_triggers.sql
├── scripts/
│   ├── run-neon-migrations.js # Migration runner (Drizzle)
│   ├── seed-neon-db.js        # Seeder (Drizzle)
│   └── query-neon-db.js       # Query helper (Drizzle)
├── lib/
│   └── neon-db-storage.js     # Storage module (Drizzle)
├── drizzle.config.ts          # Drizzle Kit configuration
└── .neon-db-ids.{env}.json    # UUID cache (environment-specific)
```

## Best Practices

1. **Test on branches first** - Use Neon branching for testing schema changes
2. **Use db:push for fresh setups** - Faster than migrations
3. **Use db:generate for tracked changes** - After initial setup
4. **Keep UUID cache in version control** - But gitignore it (contains IDs)
5. **Monitor console output** - Check insertion counts after generators run
6. **Use Drizzle Studio** - Visual debugging of database contents

## Type Safety Benefits

With Drizzle ORM, all database operations are type-safe:

```javascript
// Auto-completion and type checking
const reports = await db
  .select()
  .from(schema.dailyReports)
  .where(eq(schema.dailyReports.projectId, projectUUID));

// TypeScript knows the shape of 'reports'
// reports[0].reportDate // ✓ Type: Date
// reports[0].content    // ✓ Type: string
```

No more SQL injection vulnerabilities or typos in column names!

## Additional Resources

- **Drizzle ORM Docs**: https://orm.drizzle.team
- **Neon Docs**: https://neon.tech/docs
- **Schema Definition**: `db/schema.ts`
- **Configuration**: `drizzle.config.ts`
