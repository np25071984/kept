-- Runs once, when the container's data directory is created.
CREATE ROLE kept_app LOGIN PASSWORD 'kept_app';
CREATE DATABASE kept_test OWNER kept;
