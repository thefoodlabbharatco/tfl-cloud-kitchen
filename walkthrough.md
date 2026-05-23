# TFL Cloud Kitchen Project Walkthrough

## Recovery Status

This folder is the recovered working copy of the Antigravity project:

`C:\Users\DELL\Documents\Codex\2026-05-23\i-was-wroking-on-a-project\tfl-cloud-kitchen-recovered`

The damaged files from the sudden shutdown were backed up in `_recovery_backup/`. The active app files were restored from Git and then updated here.

## Realtime Sync Updates

- `db.js` now broadcasts local database writes across open tabs with `BroadcastChannel("tfl_sync_channel")`.
- `db.js` dispatches a shared `tfl_db_updated` browser event after local, cross-tab, and Supabase updates.
- `db.js` now supports Supabase sync for `settings`, `products`, `subbrands`, `updates`, `admins`, and `orders`.
- `db.js` subscribes to Supabase Realtime changes on `tfl_metadata` and `tfl_orders`.
- `admin.js` refreshes the active admin tab when synced data changes.
- `admin.js` plays a Web Audio API two-tone chime for new pending orders.
- `customer.js` refreshes menu/status changes and updates an open receipt when order status changes.
- `admin.html` includes Supabase settings and a copy-paste SQL setup guide.
- Customer order placement is instant: the order is saved locally first, shown to the customer immediately, then synced to cloud in the background.
- Failed cloud order syncs are queued in `tfl_pending_cloud_orders` and retried automatically.
- Live order storage prunes old completed orders. Admin Settings controls completed-order retention days and maximum completed orders kept in the live app.
- Supabase order fetches are limited to the latest 200 live records to keep admin/customer startup fast.

## Supabase Tables

Use the SQL guide in the Admin Settings tab. It creates:

- `tfl_metadata`: shared settings/menu/admin/update records.
- `tfl_orders`: order records, keyed by `order_id`.
- `product-images`: public Supabase Storage bucket for uploaded product images.

## Verification

The browser scripts were parsed and executed in a mocked DOM environment:

- `db.js`
- `admin.js`
- `customer.js`
