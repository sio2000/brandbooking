-- Rollback for 0001_init. Destroys all application data.
DROP TABLE IF EXISTS booking_page_events, rate_limits, platform_settings, feature_flags,
  uploaded_assets, audit_logs, billing_events, subscriptions, inbox_items, notifications,
  appointment_events, appointments, customers, booking_rules, time_blocks, closures,
  special_hours, weekly_hours, staff_services, services, service_categories, invitations,
  business_members, staff, businesses, auth_tokens, sessions, users CASCADE;
DROP TYPE IF EXISTS member_role, business_status, publish_status, appointment_status,
  appointment_source, actor_type, auth_token_purpose, notification_status,
  staff_selection_mode, field_requirement, asset_kind, funnel_step;
DROP FUNCTION IF EXISTS hn_set_updated_at();
DROP FUNCTION IF EXISTS hn_is_valid_timezone(text);
