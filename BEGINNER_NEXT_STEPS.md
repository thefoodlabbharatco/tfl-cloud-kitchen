# Beginner Next Steps

This is the order to follow. Do not skip the test order at the end.

## 1. Create Supabase Project

1. Go to `https://supabase.com`.
2. Sign in or create a free account.
3. Click **New project**.
4. Give it a name like `tfl-cloud-kitchen`.
5. Save the database password somewhere safe.
6. Wait until the project finishes creating.

## 2. Run The Database Setup

1. In Supabase, open your project.
2. Click **SQL Editor** in the left menu.
3. Click **New query**.
4. Open this file from your project folder:

   `supabase-setup.sql`

5. Copy everything from that file.
6. Paste it into Supabase SQL Editor.
7. Click **Run**.

If Supabase says a policy/table/publication already exists, tell me the exact message. Do not panic.

## 3. Copy Supabase Keys

1. In Supabase, go to **Project Settings**.
2. Open **API**.
3. Copy the **Project URL**.
4. Copy the **anon public key**.

You do not need the service role key for this app. Do not paste the service role key into the website.

## 4. Add Supabase In The Admin App

1. Open `admin.html` in browser or deployed website.
2. Login as owner.
3. Go to **Settings**.
4. Find **Supabase Realtime Database Sync**.
5. Tick **Enable Supabase realtime syncing**.
6. Paste the Supabase Project URL.
7. Paste the Supabase anon key.
8. Click **Save System Settings**.
9. Click **Sync Cloud** once.

## 5. Test Locally Before Going Live

Open two browser tabs:

1. `index.html` as customer.
2. `admin.html` as staff/admin.

Test these:

- Place one order from customer page.
- Check that it appears in admin quickly.
- Change delivery status in admin.
- Check that the customer receipt/status updates.
- Change kitchen open/closed in admin.
- Check that customer page updates.
- Export CSV from admin.

## 6. Deploy The Website

Recommended free hosting:

- Cloudflare Pages

Deploy the whole project folder except:

- `_recovery_backup`
- `.git`

Files that must be uploaded include:

- `index.html`
- `admin.html`
- `db.js`
- `customer.js`
- `admin.js`
- all CSS files
- images
- `manifest.json`
- `service-worker.js`

## 7. Staff Daily Routine

Morning:

1. Staff opens `admin.html`.
2. Staff logs in.
3. Staff keeps admin tab open.

During day:

1. New orders appear in admin.
2. Staff updates delivery status.
3. Staff updates payment status.

Evening:

1. Click **Export CSV**.
2. Save the CSV.
3. Click **Clear Delivered** after export if you want a clean live dashboard.

## 8. Important Rule

Your personal computer does not need to stay on after the website is deployed.

But at least one staff phone/laptop should keep the admin page open during working hours to see live orders and hear alerts.

