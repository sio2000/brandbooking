-- Usage counters for the admin Usage page: the parts of the free-plan
-- consumption the app can measure itself (production deploys, scheduler runs
-- and their duration, account emails). One row per UTC day and metric.
CREATE TABLE usage_counters (
  day date NOT NULL,
  metric text NOT NULL CHECK (char_length(metric) BETWEEN 1 AND 64),
  value bigint NOT NULL DEFAULT 0 CHECK (value >= 0),
  PRIMARY KEY (day, metric)
);
