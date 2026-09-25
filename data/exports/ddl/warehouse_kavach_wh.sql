create or replace warehouse KAVACH_WH
with
	warehouse_type='STANDARD'
	generation='2'
	warehouse_size='X-Small'
	max_cluster_count=1
	min_cluster_count=1
	scaling_policy=STANDARD
	auto_suspend=60
	auto_resume=TRUE
	initially_suspended=TRUE
	resource_monitor=KAVACH_MONITOR
	COMMENT='KAVACH project warehouse — XSMALL, cost-disciplined'
	enable_query_acceleration=TRUE
	query_acceleration_max_scale_factor=8
	max_concurrency_level=8
	statement_queued_timeout_in_seconds=0
	statement_timeout_in_seconds=172800
;