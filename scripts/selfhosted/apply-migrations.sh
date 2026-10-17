#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required for the migration runner}"

psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
SQL

found_migrations=false
for migration in /migrations/*.sql; do
  [ -f "$migration" ] || continue
  found_migrations=true

  filename=${migration##*/}
  version=${filename%%_*}
  name=${filename#*_}
  name=${name%.sql}

  case "$version" in
    ''|*[!0-9]*)
      echo "Migration filename must begin with a numeric version: $filename" >&2
      exit 1
      ;;
  esac

  applied=$(psql -X -qAt "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v migration_version="$version" <<'SQL'
SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = :'migration_version');
SQL
  )
  if [ "$applied" = "t" ]; then
    echo "Already applied: $filename"
    continue
  fi

  echo "Applying: $filename"
  psql -X --single-transaction "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v migration_version="$version" \
    -v migration_name="$name" <<SQL
\\i $migration
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (:'migration_version', :'migration_name');
SQL
done

if [ "$found_migrations" != true ]; then
  echo "No SQL migrations were found in /migrations." >&2
  exit 1
fi

echo "All versioned migrations are applied."
