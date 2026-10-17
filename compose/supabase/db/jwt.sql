-- Adapted from Supabase self-hosted Docker release self-hosted/v0.8.3.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
