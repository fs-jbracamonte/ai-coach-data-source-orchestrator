CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"content" text NOT NULL,
	"blob_key" text,
	"blob_url" text,
	"author_name" text NOT NULL,
	"checksum_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"transcript_date" timestamp NOT NULL,
	"filename" text NOT NULL,
	"transcript_text" text NOT NULL,
	"blob_key" text,
	"blob_url" text,
	"byte_size" bigint,
	"checksum_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jira_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"collected_week_start" date NOT NULL,
	"collected_week_end" date NOT NULL,
	"blob_key" text NOT NULL,
	"blob_url" text NOT NULL,
	"byte_size" bigint,
	"checksum_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"collected_week_start" date NOT NULL,
	"collected_week_end" date NOT NULL,
	"blob_key" text NOT NULL,
	"blob_url" text NOT NULL,
	"byte_size" bigint,
	"checksum_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "generated_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"triggered_by" text,
	"generated_at" timestamp NOT NULL,
	"execution_id" text,
	"blob_key" text,
	"blob_url" text,
	"output" jsonb,
	"model_info" jsonb,
	"content_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_data_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_report_id" uuid NOT NULL,
	"jira_snapshot_id" uuid,
	"slack_capture_id" uuid,
	"daily_report_id" uuid,
	"meeting_transcript_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_exactly_one_source" CHECK (num_nonnulls(jira_snapshot_id, slack_capture_id, daily_report_id, meeting_transcript_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_client_id_organizations_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_project_id_teams_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_transcripts" ADD CONSTRAINT "meeting_transcripts_project_id_teams_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_snapshots" ADD CONSTRAINT "jira_snapshots_project_id_teams_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_captures" ADD CONSTRAINT "slack_captures_project_id_teams_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_report_type_id_report_types_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_project_id_teams_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_data_links" ADD CONSTRAINT "report_data_links_generated_report_id_generated_reports_id_fk" FOREIGN KEY ("generated_report_id") REFERENCES "public"."generated_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_data_links" ADD CONSTRAINT "report_data_links_jira_snapshot_id_jira_snapshots_id_fk" FOREIGN KEY ("jira_snapshot_id") REFERENCES "public"."jira_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_data_links" ADD CONSTRAINT "report_data_links_slack_capture_id_slack_captures_id_fk" FOREIGN KEY ("slack_capture_id") REFERENCES "public"."slack_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_data_links" ADD CONSTRAINT "report_data_links_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_data_links" ADD CONSTRAINT "report_data_links_meeting_transcript_id_meeting_transcripts_id_fk" FOREIGN KEY ("meeting_transcript_id") REFERENCES "public"."meeting_transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_reports_project_id" ON "daily_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_daily_reports_project_date" ON "daily_reports" USING btree ("project_id","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_daily_project_author_date" ON "daily_reports" USING btree ("project_id","author_name","report_date");--> statement-breakpoint
CREATE INDEX "idx_transcripts_project_id" ON "meeting_transcripts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_transcripts_date" ON "meeting_transcripts" USING btree ("transcript_date");--> statement-breakpoint
CREATE INDEX "idx_transcripts_project_date" ON "meeting_transcripts" USING btree ("project_id","transcript_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transcript_project_filename_date" ON "meeting_transcripts" USING btree ("project_id","filename","transcript_date");--> statement-breakpoint
CREATE INDEX "idx_jira_snapshots_project_id" ON "jira_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_jira_snapshots_project_week" ON "jira_snapshots" USING btree ("project_id","collected_week_start");--> statement-breakpoint
CREATE INDEX "idx_slack_captures_project_id" ON "slack_captures" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_slack_captures_week_start" ON "slack_captures" USING btree ("collected_week_start");--> statement-breakpoint
CREATE INDEX "idx_slack_captures_project_week" ON "slack_captures" USING btree ("project_id","collected_week_start");--> statement-breakpoint
CREATE INDEX "idx_generated_reports_project_type_date" ON "generated_reports" USING btree ("project_id","report_type_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_execution_id" ON "generated_reports" USING btree ("execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_proj_type_hash" ON "generated_reports" USING btree ("project_id","report_type_id","content_hash");--> statement-breakpoint
CREATE INDEX "idx_rdl_generated_report" ON "report_data_links" USING btree ("generated_report_id");--> statement-breakpoint
CREATE INDEX "idx_rdl_jira_snapshot" ON "report_data_links" USING btree ("jira_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_rdl_slack_capture" ON "report_data_links" USING btree ("slack_capture_id");--> statement-breakpoint
CREATE INDEX "idx_rdl_daily_report" ON "report_data_links" USING btree ("daily_report_id");--> statement-breakpoint
CREATE INDEX "idx_rdl_meeting_transcript" ON "report_data_links" USING btree ("meeting_transcript_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rdl_board" ON "report_data_links" USING btree ("generated_report_id","jira_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rdl_slack" ON "report_data_links" USING btree ("generated_report_id","slack_capture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rdl_daily" ON "report_data_links" USING btree ("generated_report_id","daily_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rdl_meeting" ON "report_data_links" USING btree ("generated_report_id","meeting_transcript_id");