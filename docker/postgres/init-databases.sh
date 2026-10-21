#!/bin/sh
set -eu

if [ -z "${POSTGRES_USER:-}" ]; then
	echo 'POSTGRES_USER is required' >&2
	exit 1
fi

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
	SELECT 'CREATE DATABASE acmecrm'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acmecrm')\gexec
SQL
