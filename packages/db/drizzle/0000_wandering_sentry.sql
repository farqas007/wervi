CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"actor_user_id" uuid,
	"request_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_parent_not_self_check" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"about" text,
	"website_url" text,
	"country_code" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"budget_model" text DEFAULT 'fixed' NOT NULL,
	"agreed_amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_status_check" CHECK ("contracts"."status" in ('draft', 'active', 'paused', 'completed', 'cancelled', 'disputed')),
	CONSTRAINT "contracts_budget_model_check" CHECK ("contracts"."budget_model" in ('fixed', 'hourly')),
	CONSTRAINT "contracts_currency_check" CHECK ("contracts"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'HKD', 'JPY', 'KRW', 'AED', 'TRY', 'BHD', 'KWD')),
	CONSTRAINT "contracts_amount_positive_check" CHECK ("contracts"."agreed_amount_minor" > 0),
	CONSTRAINT "contracts_client_not_freelancer_check" CHECK ("contracts"."client_id" <> "contracts"."freelancer_id"),
	CONSTRAINT "contracts_dates_order_check" CHECK ("contracts"."starts_on" is null or "contracts"."ends_on" is null or "contracts"."starts_on" <= "contracts"."ends_on"),
	CONSTRAINT "contracts_completed_at_check" CHECK ("contracts"."status" <> 'completed' or "contracts"."completed_at" is not null),
	CONSTRAINT "contracts_cancelled_at_check" CHECK ("contracts"."status" <> 'cancelled' or "contracts"."cancelled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "freelancer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"bio" text,
	"hourly_rate_minor" bigint,
	"currency" text,
	"availability" text DEFAULT 'available' NOT NULL,
	"timezone" text NOT NULL,
	"country_code" varchar(2),
	"experience_level" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freelancer_profiles_currency_check" CHECK ("freelancer_profiles"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'HKD', 'JPY', 'KRW', 'AED', 'TRY', 'BHD', 'KWD')),
	CONSTRAINT "freelancer_profiles_availability_check" CHECK ("freelancer_profiles"."availability" in ('available', 'limited', 'unavailable')),
	CONSTRAINT "freelancer_profiles_visibility_check" CHECK ("freelancer_profiles"."visibility" in ('public', 'private')),
	CONSTRAINT "freelancer_profiles_experience_level_check" CHECK ("freelancer_profiles"."experience_level" is null or "freelancer_profiles"."experience_level" in ('entry', 'intermediate', 'expert', 'senior')),
	CONSTRAINT "freelancer_profiles_hourly_rate_check" CHECK ("freelancer_profiles"."hourly_rate_minor" >= 0),
	CONSTRAINT "freelancer_profiles_rate_currency_pair_check" CHECK (("freelancer_profiles"."hourly_rate_minor" is null and "freelancer_profiles"."currency" is null) or ("freelancer_profiles"."hourly_rate_minor" is not null and "freelancer_profiles"."currency" is not null))
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "job_skills_pkey" PRIMARY KEY("job_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"budget_model" text DEFAULT 'fixed' NOT NULL,
	"budget_min_minor" bigint,
	"budget_max_minor" bigint,
	"currency" text NOT NULL,
	"experience_level" text,
	"duration" text,
	"work_mode" text DEFAULT 'remote' NOT NULL,
	"country_code" varchar(2),
	"proposal_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_slug_key" UNIQUE("slug"),
	CONSTRAINT "jobs_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('draft', 'published', 'paused', 'closed')),
	CONSTRAINT "jobs_visibility_check" CHECK ("jobs"."visibility" in ('public', 'invite_only', 'private')),
	CONSTRAINT "jobs_budget_model_check" CHECK ("jobs"."budget_model" in ('fixed', 'hourly')),
	CONSTRAINT "jobs_work_mode_check" CHECK ("jobs"."work_mode" in ('remote', 'hybrid', 'onsite')),
	CONSTRAINT "jobs_currency_check" CHECK ("jobs"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'HKD', 'JPY', 'KRW', 'AED', 'TRY', 'BHD', 'KWD')),
	CONSTRAINT "jobs_experience_level_check" CHECK ("jobs"."experience_level" is null or "jobs"."experience_level" in ('entry', 'intermediate', 'expert', 'senior')),
	CONSTRAINT "jobs_duration_check" CHECK ("jobs"."duration" is null or "jobs"."duration" in ('less_than_30_days', 'one_to_three_months', 'three_to_six_months', 'six_to_nine_months', 'over_nine_months')),
	CONSTRAINT "jobs_budget_min_check" CHECK ("jobs"."budget_min_minor" >= 0),
	CONSTRAINT "jobs_budget_max_check" CHECK ("jobs"."budget_max_minor" >= 0),
	CONSTRAINT "jobs_budget_range_check" CHECK ("jobs"."budget_min_minor" is null or "jobs"."budget_max_minor" is null or "jobs"."budget_min_minor" <= "jobs"."budget_max_minor"),
	CONSTRAINT "jobs_proposal_count_check" CHECK ("jobs"."proposal_count" >= 0),
	CONSTRAINT "jobs_published_at_check" CHECK ("jobs"."status" <> 'published' or "jobs"."published_at" is not null),
	CONSTRAINT "jobs_closed_at_check" CHECK ("jobs"."status" <> 'closed' or "jobs"."closed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "milestone_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"milestone_id" uuid NOT NULL,
	"revision_number" smallint NOT NULL,
	"note" text,
	"outcome" text,
	"reviewed_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestone_deliveries_revision_check" CHECK ("milestone_deliveries"."revision_number" >= 1),
	CONSTRAINT "milestone_deliveries_outcome_check" CHECK ("milestone_deliveries"."outcome" is null or "milestone_deliveries"."outcome" in ('approved', 'changes_requested', 'rejected')),
	CONSTRAINT "milestone_deliveries_review_pair_check" CHECK (("milestone_deliveries"."outcome" is null and "milestone_deliveries"."reviewed_at" is null) or ("milestone_deliveries"."outcome" is not null and "milestone_deliveries"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"due_date" date,
	"max_revisions" smallint DEFAULT 3 NOT NULL,
	"funded_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_status_check" CHECK ("milestones"."status" in ('planned', 'funded', 'in_progress', 'submitted', 'changes_requested', 'approved', 'released', 'cancelled')),
	CONSTRAINT "milestones_currency_check" CHECK ("milestones"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'HKD', 'JPY', 'KRW', 'AED', 'TRY', 'BHD', 'KWD')),
	CONSTRAINT "milestones_amount_positive_check" CHECK ("milestones"."amount_minor" > 0),
	CONSTRAINT "milestones_position_positive_check" CHECK ("milestones"."position" > 0),
	CONSTRAINT "milestones_max_revisions_min_check" CHECK ("milestones"."max_revisions" >= 0),
	CONSTRAINT "milestones_max_revisions_max_check" CHECK ("milestones"."max_revisions" <= 10)
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_items_position_check" CHECK ("portfolio_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profile_languages" (
	"freelancer_id" uuid NOT NULL,
	"language_code" varchar(2) NOT NULL,
	"proficiency" text NOT NULL,
	CONSTRAINT "profile_languages_pkey" PRIMARY KEY("freelancer_id","language_code"),
	CONSTRAINT "profile_languages_proficiency_check" CHECK ("profile_languages"."proficiency" in ('basic', 'conversational', 'fluent', 'native'))
);
--> statement-breakpoint
CREATE TABLE "profile_skills" (
	"freelancer_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"proficiency" text NOT NULL,
	"years_experience" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	CONSTRAINT "profile_skills_pkey" PRIMARY KEY("freelancer_id","skill_id"),
	CONSTRAINT "profile_skills_proficiency_check" CHECK ("profile_skills"."proficiency" in ('beginner', 'intermediate', 'advanced', 'expert')),
	CONSTRAINT "profile_skills_years_experience_check" CHECK ("profile_skills"."years_experience" is null or "profile_skills"."years_experience" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"cover_letter" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"delivery_days" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"client_note" text,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shortlisted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_id_job_id_key" UNIQUE("id","job_id"),
	CONSTRAINT "proposals_id_freelancer_id_key" UNIQUE("id","freelancer_id"),
	CONSTRAINT "proposals_status_check" CHECK ("proposals"."status" in ('submitted', 'shortlisted', 'rejected', 'accepted', 'withdrawn', 'expired')),
	CONSTRAINT "proposals_currency_check" CHECK ("proposals"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'HKD', 'JPY', 'KRW', 'AED', 'TRY', 'BHD', 'KWD')),
	CONSTRAINT "proposals_amount_positive_check" CHECK ("proposals"."amount_minor" > 0),
	CONSTRAINT "proposals_revision_check" CHECK ("proposals"."revision" >= 1),
	CONSTRAINT "proposals_client_not_freelancer_check" CHECK ("proposals"."client_id" <> "proposals"."freelancer_id"),
	CONSTRAINT "proposals_delivery_days_check" CHECK ("proposals"."delivery_days" is null or "proposals"."delivery_days" between 1 and 3650),
	CONSTRAINT "proposals_accepted_needs_decision_check" CHECK ("proposals"."status" <> 'accepted' or "proposals"."decided_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"title" text,
	"body" text,
	"status" text DEFAULT 'published' NOT NULL,
	"editable_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_status_check" CHECK ("reviews"."status" in ('published', 'pending_edit', 'hidden', 'removed')),
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_author_not_subject_check" CHECK ("reviews"."author_id" <> "reviews"."subject_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('pending', 'active', 'suspended', 'closed')),
	CONSTRAINT "users_roles_check" CHECK ("users"."roles" <@ '{client,freelancer,admin}')
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_freelancer_id_users_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_job_id_client_id_fk" FOREIGN KEY ("job_id","client_id") REFERENCES "public"."jobs"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposal_id_job_id_fk" FOREIGN KEY ("proposal_id","job_id") REFERENCES "public"."proposals"("id","job_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposal_id_freelancer_id_fk" FOREIGN KEY ("proposal_id","freelancer_id") REFERENCES "public"."proposals"("id","freelancer_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freelancer_profiles" ADD CONSTRAINT "freelancer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_deliveries" ADD CONSTRAINT "milestone_deliveries_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_deliveries" ADD CONSTRAINT "milestone_deliveries_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_freelancer_id_freelancer_profiles_user_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_languages" ADD CONSTRAINT "profile_languages_freelancer_id_freelancer_profiles_user_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_freelancer_id_freelancer_profiles_user_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_freelancer_id_users_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_job_id_client_id_fk" FOREIGN KEY ("job_id","client_id") REFERENCES "public"."jobs"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_request_id_idx" ON "audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_unique" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_unique" ON "auth_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_position_idx" ON "categories" USING btree ("position");--> statement-breakpoint
CREATE INDEX "client_profiles_country_code_idx" ON "client_profiles" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_proposal_id_unique" ON "contracts" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_one_open_per_job_unique" ON "contracts" USING btree ("job_id") WHERE "contracts"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "contracts_client_id_status_idx" ON "contracts" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "contracts_freelancer_id_status_idx" ON "contracts" USING btree ("freelancer_id","status");--> statement-breakpoint
CREATE INDEX "freelancer_profiles_availability_idx" ON "freelancer_profiles" USING btree ("availability");--> statement-breakpoint
CREATE INDEX "freelancer_profiles_country_code_idx" ON "freelancer_profiles" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "job_skills_skill_id_idx" ON "job_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "jobs_status_published_at_idx" ON "jobs" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "jobs_client_id_created_at_idx" ON "jobs" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_work_mode_idx" ON "jobs" USING btree ("work_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_deliveries_milestone_revision_unique" ON "milestone_deliveries" USING btree ("milestone_id","revision_number");--> statement-breakpoint
CREATE INDEX "milestone_deliveries_milestone_id_idx" ON "milestone_deliveries" USING btree ("milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_contract_id_position_unique" ON "milestones" USING btree ("contract_id","position");--> statement-breakpoint
CREATE INDEX "milestones_contract_id_status_idx" ON "milestones" USING btree ("contract_id","status");--> statement-breakpoint
CREATE INDEX "milestones_due_date_idx" ON "milestones" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "portfolio_items_freelancer_id_position_idx" ON "portfolio_items" USING btree ("freelancer_id","position");--> statement-breakpoint
CREATE INDEX "profile_languages_language_code_idx" ON "profile_languages" USING btree ("language_code");--> statement-breakpoint
CREATE INDEX "profile_skills_skill_id_idx" ON "profile_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_job_id_freelancer_id_unique" ON "proposals" USING btree ("job_id","freelancer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_one_accepted_per_job_unique" ON "proposals" USING btree ("job_id") WHERE "proposals"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "proposals_freelancer_id_status_idx" ON "proposals" USING btree ("freelancer_id","status");--> statement-breakpoint
CREATE INDEX "proposals_client_id_status_idx" ON "proposals" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "proposals_job_id_status_idx" ON "proposals" USING btree ("job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_contract_id_author_id_unique" ON "reviews" USING btree ("contract_id","author_id");--> statement-breakpoint
CREATE INDEX "reviews_subject_id_status_idx" ON "reviews" USING btree ("subject_id","status");--> statement-breakpoint
CREATE INDEX "reviews_author_id_idx" ON "reviews" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_unique" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_category_id_idx" ON "skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "skills_position_idx" ON "skills" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_roles_idx" ON "users" USING gin ("roles");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");