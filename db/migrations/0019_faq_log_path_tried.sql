-- path_tried now also needs to express "used query_database" (added to the
-- FAQ agent's toolset) alongside the existing faq/code paths, and future
-- tools shouldn't need another migration each time — drop the fixed enum in
-- favor of a free-form "+"-joined descriptor (e.g. "faq+code+data").
ALTER TABLE faq_unanswered_log DROP CONSTRAINT faq_unanswered_log_path_tried_check;
ALTER TABLE faq_unanswered_log ADD CONSTRAINT faq_unanswered_log_path_tried_check CHECK (path_tried <> '');
