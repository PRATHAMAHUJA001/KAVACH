create or replace schema KAVACH_DB.APP COMMENT='App-facing views, stored procs, SPCS objects';

create or replace TABLE KAVACH_DB.APP.SETTINGS (
	KEY VARCHAR(16777216) NOT NULL,
	VALUE VARCHAR(16777216),
	UPDATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
	primary key (KEY)
);