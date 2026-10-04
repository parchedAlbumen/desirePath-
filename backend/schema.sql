-- Database schema for desirePath (Postgres / Tiger Data).
-- Safe to re-run: every statement uses IF NOT EXISTS, so it never touches existing data.
--   psql "$DATABASE_URL" -f schema.sql
-- Keep this file in sync with the live DB whenever a table or column changes.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    distance          NUMERIC(6, 2) NOT NULL,
    elevation_gain    INTEGER NOT NULL DEFAULT 0,
    elevation_loss    INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    difficulty        TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    terrain           TEXT,
    estimated_minutes INTEGER CHECK (estimated_minutes >= 0)
);

CREATE TABLE IF NOT EXISTS route_points (
    route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    point_order INTEGER NOT NULL,
    lat         NUMERIC(9, 6) NOT NULL,
    lng         NUMERIC(9, 6) NOT NULL,
    elevation   NUMERIC(7, 2),
    PRIMARY KEY (route_id, point_order)
);

-- A recorded run. route_id is the generated route's text id from the frontend, not routes.id.
CREATE TABLE IF NOT EXISTS runs (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id       TEXT,
    route_name     TEXT NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    duration_sec   INTEGER NOT NULL CHECK (duration_sec >= 0),
    distance_km    NUMERIC NOT NULL CHECK (distance_km >= 0),
    elevation_gain INTEGER NOT NULL DEFAULT 0 CHECK (elevation_gain >= 0),
    points         JSONB NOT NULL DEFAULT '[]'::jsonb,
    planned_route  JSONB,
    is_favorite    BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
