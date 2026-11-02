-- +goose Up
ALTER TABLE vpn_servers
 ADD COLUMN panel_version text NOT NULL DEFAULT '',
 ADD COLUMN xray_version text NOT NULL DEFAULT '',
 ADD COLUMN panel_compatibility text NOT NULL DEFAULT 'unknown' CHECK(panel_compatibility IN ('supported','unsupported','unknown')),
 ADD COLUMN panel_compatibility_reason text NOT NULL DEFAULT 'not_checked' CHECK(length(panel_compatibility_reason)<=64);

-- +goose Down
ALTER TABLE vpn_servers DROP COLUMN panel_version, DROP COLUMN xray_version,
 DROP COLUMN panel_compatibility, DROP COLUMN panel_compatibility_reason;
