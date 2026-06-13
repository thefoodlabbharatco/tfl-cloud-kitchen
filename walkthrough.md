# Walkthrough - Browser-Based Social Automation & Cloud Sync

We have completed the implementation of the online social media AI generation dashboard and recovered the cloud database sync engine.

You now have a **100% browser-based social generator and manager** that runs directly inside your Cloud Kitchen Admin Dashboard (`admin.html`). You do **not** need to open any terminal window, run Python commands, or manage a local Ollama server.

---

## 🚀 Step-by-Step Setup Guide

### 1. How to get your Google Gemini API Key (10 Seconds, 100% Free)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google account.
3. Click the blue **"Create API Key"** button at the top left.
4. Copy the API key (starts with `AIzaSy...`).
5. Open your Cloud Kitchen Admin Dashboard (`admin.html`), go to the **Settings** tab, paste it into the **Google Gemini API Key** field, and click **Save**.

### 2. How to set up your Supabase Online Cloud Database (Free)
1. Go to [Supabase](https://supabase.com/) and create a free account.
2. Click **New Project**, name it `The Food Lab`, and set a database password.
3. Once the database is ready, go to the **SQL Editor** tab (on the left menu).
4. Click **New query**, open your project file [supabase-setup.sql](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/supabase-setup.sql), copy its entire contents, paste it into the editor, and click **Run**. This automatically creates all your tables (settings, products, orders, updates, and social drafts!).
5. Go to the **Storage** tab (on the left menu) and click **New bucket**. Name it exactly: `product-images`. Make sure to toggle **Public bucket** to **ENABLED** (so images are visible online), then save.
6. Go to **Project Settings** (gear icon) -> **API** on the left menu.
7. Copy the **Project URL**.
8. Copy the **anon public key**.
9. In your Admin Dashboard Settings, toggle **Enable Supabase Database Syncing**, paste these two credentials, and click **Save**.

---

## 🎨 Using your new Social Media AI Dashboard

1. In `admin.html`, click the new **Social Media AI** tab on the sidebar.
2. Select how many days of content you want to generate (1, 3, or 7 days) and click **"Generate AI Calendar"**.
3. The AI will call Gemini online, read your live menu items (including the newly added **Cheese Loaded Nachos**), and schedule **two posts per day**:
   - **Lunch Slot (11:30 AM)**: Tailored for Lucknow's thalis, parathas, and rice bowls with relatable office/midday jokes.
   - **Dinner Slot (7:30 PM)**: Tailored for Lucknow's evening vibes, Hazratganj strolls, late-night comfort foods (peri-peri fries, loaded nachos, shikanji combos).
4. Every post features:
   - A **relatable meme hook** (POV, Nobody: , etc.) customized for the dish.
   - Specific **trending Instagram song recommendations** (AP Dhillon, Diljit, Bollywood remixes) and transition cues.
   - Localized Lucknow foodie hashtags (`#lucknowfoodies`, `#lucknoweats`).
   - A detailed prompt for generating the image creative.
5. Review and edit the caption directly on the screen.
6. Click **Approve Post** to mark it ready.
7. Click **Publish to Instagram**:
   - If your Instagram Page ID and Meta Token aren't set, it **safely copies** the combined caption and hashtags to your clipboard, letting you publish manually with **0% risk of account bans**.
   - If they are set, it officially posts it via Meta's secure API.

---

## 📂 Source Code & Modifications Summary

1. [db.js](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/db.js):
   - Added **Cheese Loaded Nachos** to the default menu items.
   - Implemented the Supabase client connection and data fetch/push queries (`syncToSupabase`, `syncFromSupabase`).
   - Added `social_drafts` cache getters/setters and database sync for Google Sheets & Supabase.
2. [admin.html](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/admin.html):
   - Added credential inputs for Supabase, Gemini Key, and Instagram parameters to the Settings panel.
   - Built a beautiful Megaphone/Instagram tab view with visual calendar slots and detailed review fields.
3. [admin.js](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/admin.js):
   - Implemented the browser-based Gemini API generation code using the `fetch()` API and a structured JSON response schema.
   - Added timeline rendering, Clipboard copy functions, and official Meta publishing.
4. [supabase-setup.sql](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/supabase-setup.sql):
   - Created the table creation scripts and RLS settings for easy database setups.
5. [google-script.txt](file:///C:/Users/DELL/.gemini/antigravity/scratch/tfl-cloud-kitchen/google-script.txt):
   - Updated the Google Sheets Apps Script layout to include social drafts sync.
