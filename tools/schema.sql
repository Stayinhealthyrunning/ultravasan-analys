PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT,
  source_type TEXT NOT NULL,
  terms_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS races (
  id INTEGER PRIMARY KEY,
  race_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  race_date TEXT,
  distance_km REAL,
  event_code TEXT,
  result_year_path INTEGER,
  official_url TEXT,
  course_version TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY,
  race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  checkpoint_key TEXT NOT NULL,
  name TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  distance_km REAL,
  elevation_m REAL,
  UNIQUE(race_id, checkpoint_key),
  UNIQUE(race_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS athletes (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sex TEXT,
  birth_year INTEGER,
  nationality TEXT,
  city TEXT,
  country TEXT,
  athlete_match_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_athletes_normalized_name ON athletes(normalized_name);

CREATE TABLE IF NOT EXISTS athlete_external_ids (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  profile_url TEXT,
  confidence REAL,
  UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  race_id INTEGER REFERENCES races(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  source_result_id TEXT NOT NULL,
  source_url TEXT,
  bib TEXT,
  name_as_published TEXT NOT NULL,
  sex TEXT,
  age INTEGER,
  birth_year INTEGER,
  age_class TEXT,
  nationality TEXT,
  club TEXT,
  city TEXT,
  county TEXT,
  start_group TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  finish_seconds INTEGER,
  gun_seconds INTEGER,
  net_seconds INTEGER,
  overall_place INTEGER,
  gender_place INTEGER,
  class_place INTEGER,
  pace_seconds_per_km REAL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT,
  UNIQUE(race_id, source_id, source_result_id)
);

CREATE INDEX IF NOT EXISTS idx_results_race ON results(race_id);
CREATE INDEX IF NOT EXISTS idx_results_athlete ON results(athlete_id);
CREATE INDEX IF NOT EXISTS idx_results_finish ON results(race_id, finish_seconds);

CREATE TABLE IF NOT EXISTS splits (
  id INTEGER PRIMARY KEY,
  result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  checkpoint_id INTEGER NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  elapsed_seconds INTEGER,
  segment_seconds INTEGER,
  place_overall INTEGER,
  place_gender INTEGER,
  place_class INTEGER,
  pace_seconds_per_km REAL,
  reported_pace_seconds_per_km REAL,
  speed_kmh REAL,
  time_of_day TEXT,
  diff_seconds INTEGER,
  status TEXT,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  UNIQUE(result_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_splits_result ON splits(result_id);

CREATE TABLE IF NOT EXISTS source_records (
  id INTEGER PRIMARY KEY,
  import_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  race_id INTEGER REFERENCES races(id),
  record_type TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  http_status INTEGER,
  content_sha256 TEXT,
  cache_path TEXT,
  payload_text TEXT,
  UNIQUE(source_id, race_id, record_type, external_id, content_sha256)
);

CREATE TABLE IF NOT EXISTS athlete_match_candidates (
  id INTEGER PRIMARY KEY,
  result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  candidate_athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  reasons TEXT,
  decision TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(result_id, candidate_athlete_id)
);
