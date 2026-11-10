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
