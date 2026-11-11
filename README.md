# prepboard

A LeetCode consistency tracker that looks like a code editor.

- **overview.tsx**: streaks (current and longest), today's target, a git-style contribution graph, weekly chart, daily targets and the nudge.
- **problems.tsx**: every solved question with its number and topic tags, grouped by day.
- **calendar.tsx**: month calendar with the questions solved each day, plus a topic bubble chart.
- **contests.tsx**: next weekly and biweekly contests with countdowns, an "I registered" button, and your contest rating history.
- **Desktop nudge** (Windows): a pixel car drives across the screen towing a COMPLETE LEETCODE banner at your nudge time and at 9 pm, if you haven't hit 3 problems.

## Run it locally

Needs Java 21, Node 20+ and PostgreSQL with a `preptracker_db` database.

```bash
# backend (http://localhost:8080)
cd backend
cp application-local.properties.example application-local.properties   # then fill it in
./mvnw spring-boot:run

# frontend (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Optional: set `LEETCODE_SESSION` / `LEETCODE_CSRF_TOKEN`, or connect LeetCode from the calendar page, to import your full submission history.


## Windows Smart App Control – Installation Fix

Windows Smart App Control may block the PrepBoard Helper scripts because they are downloaded from the internet and are not digitally signed by a recognized publisher.

To resolve this, unblock the ZIP file **before extracting it**.

### Steps to Fix

1. Delete the existing `prepboard-helper` folder if you have already extracted it.
2. Navigate to your **Downloads** folder and locate `prepboard-helper.zip`.
3. Right-click the ZIP file and select **Properties**.
4. Under the **General** tab, look for the **Security** section at the bottom.
5. Check the **Unblock** checkbox and click **Apply → OK**.
6. Right-click the ZIP file and select **Extract All**.
7. Open the extracted `prepboard-helper` folder.
8. Double-click **INSTALL - double-click me** to start the installation.

> **Important:** Unblock the ZIP before extracting it so that the downloaded-file security marker is not propagated to the extracted files.

**Note:** The Unblock option is generally available for files marked as downloaded from the internet. It does not guarantee that Smart App Control will allow every script to run. If Windows still blocks the installer, inspect the script and use a trusted, properly signed executable rather than disabling Windows security.
