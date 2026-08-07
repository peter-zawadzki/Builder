-- Every bug/feature submission (any platform) now gets a developer-ready
-- brief — either the existing Builder bug fix recommendation (bug_analysis,
-- unchanged) or, for everything bug_analysis doesn't cover (Builder
-- features, and YULLR.com/Portal bugs+features), a Claude-Code-ready user
-- story written to dev_brief. completed_at backs the new admin "mark
-- completed" action, independent of the existing in_review/approved pipeline.
ALTER TABLE feedback_submissions ADD COLUMN dev_brief text;
ALTER TABLE feedback_submissions ADD COLUMN completed_at timestamptz;
