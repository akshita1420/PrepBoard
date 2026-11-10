package com.preptracker.backend.service;

import com.preptracker.backend.model.LeetCodeLog;
import com.preptracker.backend.model.QuestionMeta;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.ContestRegistrationRepository;
import com.preptracker.backend.repository.LeetCodeLogRepository;
import com.preptracker.backend.repository.QuestionMetaRepository;
import com.preptracker.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Tag counts, question details, contest schedule/history, and contest registration reminders. */
@Service
public class LeetCodeInsightsService {

    private static final Logger log = LoggerFactory.getLogger(LeetCodeInsightsService.class);

    // Known contest dates; every later one is a fixed number of weeks after these (times are UTC).
    private static final long WEEKLY_ANCHOR_START = 1782613800L;   // Weekly Contest 508, Sun 02:30 UTC
    private static final int WEEKLY_ANCHOR_NUMBER = 508;
    private static final long BIWEEKLY_ANCHOR_START = 1783175400L; // Biweekly Contest 186, Sat 14:30 UTC
    private static final int BIWEEKLY_ANCHOR_NUMBER = 186;
    private static final long WEEK = 7 * 86_400L;
    private static final long CONTEST_DURATION = 5_400L;

    // Remind this long before a contest starts, if the user hasn't said they registered.
    private static final long[] REMINDER_LEADS = {24 * 3_600L, 2 * 3_600L};

    private final LeetCodeService leetCodeService;
    private final QuestionMetaRepository metaRepository;
    private final LeetCodeLogRepository logRepository;
    private final UserRepository userRepository;
    private final ContestRegistrationRepository registrationRepository;
    private final DesktopNudgeService desktopNudgeService;
    private final PushNotificationService pushNotificationService;

    private final ExecutorService metaFiller = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "question-meta-filler");
        t.setDaemon(true);
        return t;
    });
    private final Set<String> pendingSlugs = ConcurrentHashMap.newKeySet();

    public LeetCodeInsightsService(LeetCodeService leetCodeService,
                                   QuestionMetaRepository metaRepository,
                                   LeetCodeLogRepository logRepository,
                                   UserRepository userRepository,
                                   ContestRegistrationRepository registrationRepository,
                                   DesktopNudgeService desktopNudgeService,
                                   PushNotificationService pushNotificationService) {
        this.leetCodeService = leetCodeService;
        this.metaRepository = metaRepository;
        this.logRepository = logRepository;
        this.userRepository = userRepository;
        this.registrationRepository = registrationRepository;
        this.desktopNudgeService = desktopNudgeService;
        this.pushNotificationService = pushNotificationService;
    }

    // ── Tags ──────────────────────────────────────────────────────────

    /** Problems solved per topic tag, across the user's whole LeetCode history (public data). */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchTagCounts(String username) {
        Map<String, Object> data = leetCodeService.queryPublic("""
                query tags($username: String!) {
                  matchedUser(username: $username) {
                    tagProblemCounts {
                      advanced { tagName tagSlug problemsSolved }
                      intermediate { tagName tagSlug problemsSolved }
                      fundamental { tagName tagSlug problemsSolved }
                    }
                  }
                }
                """, Map.of("username", username));
        Map<String, Object> user = (Map<String, Object>) data.get("matchedUser");
        Map<String, Object> counts = user == null ? null : (Map<String, Object>) user.get("tagProblemCounts");
        if (counts == null) return List.of();

        Map<String, Map<String, Object>> bySlug = new LinkedHashMap<>();
        for (String level : List.of("fundamental", "intermediate", "advanced")) {
            Object list = counts.get(level);
            if (!(list instanceof List<?> items)) continue;
            for (Object item : items) {
                Map<String, Object> tag = (Map<String, Object>) item;
                int solved = ((Number) tag.getOrDefault("problemsSolved", 0)).intValue();
                if (solved <= 0) continue;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("tagName", tag.get("tagName"));
                row.put("tagSlug", tag.get("tagSlug"));
                row.put("level", level);
                row.put("solved", solved);
                bySlug.putIfAbsent(String.valueOf(tag.get("tagSlug")), row);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>(bySlug.values());
        rows.sort((a, b) -> Integer.compare((int) b.get("solved"), (int) a.get("solved")));
        return rows;
    }

    // ── Question details (number + tags) ──────────────────────────────

    /** Known details for every question this user has solved; missing ones are fetched in the background. */
    public Map<String, Object> questionsFor(String username) {
        Set<String> slugs = new LinkedHashSet<>();
        for (LeetCodeLog l : logRepository.findByUserLeetcodeUsernameIgnoreCase(username)) {
            if (l.getTitleSlug() != null && !l.getTitleSlug().isBlank()) slugs.add(l.getTitleSlug());
        }
        Map<String, QuestionMeta> known = new HashMap<>();
        metaRepository.findAllById(slugs).forEach(m -> known.put(m.getTitleSlug(), m));

        List<String> missing = slugs.stream().filter(s -> !known.containsKey(s)).toList();
        requestFill(missing);

        List<Map<String, Object>> out = new ArrayList<>();
        for (QuestionMeta m : known.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("titleSlug", m.getTitleSlug());
            row.put("frontendId", m.getFrontendId());
            row.put("difficulty", m.getDifficulty());
            row.put("tags", m.getTags() == null || m.getTags().isBlank() ? List.of() : List.of(m.getTags().split(",")));
            out.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pending", missing.size());
        result.put("questions", out);
        return result;
    }

    private void requestFill(Collection<String> slugs) {
        List<String> fresh = slugs.stream().filter(pendingSlugs::add).toList();
        if (fresh.isEmpty()) return;
        metaFiller.submit(() -> {
            for (String slug : fresh) {
                try {
                    fetchAndSaveMeta(slug);
                    Thread.sleep(250); // stay well under LeetCode's rate limits
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                } catch (Exception e) {
                    log.warn("Could not fetch details for {}: {}", slug, e.getMessage());
                } finally {
                    pendingSlugs.remove(slug);
                }
            }
        });
    }

    @SuppressWarnings("unchecked")
    private void fetchAndSaveMeta(String slug) {
        Map<String, Object> data = leetCodeService.queryPublic("""
                query q($titleSlug: String!) {
                  question(titleSlug: $titleSlug) { questionFrontendId title difficulty topicTags { name } }
                }
                """, Map.of("titleSlug", slug));
        Map<String, Object> q = (Map<String, Object>) data.get("question");
        if (q == null) return;
        List<String> tags = new ArrayList<>();
        Object topicTags = q.get("topicTags");
        if (topicTags instanceof List<?> list) {
            for (Object t : list) tags.add(String.valueOf(((Map<String, Object>) t).get("name")));
        }
        metaRepository.save(QuestionMeta.builder()
                .titleSlug(slug)
                .frontendId(q.get("questionFrontendId") == null ? null : String.valueOf(q.get("questionFrontendId")))
                .title((String) q.get("title"))
                .difficulty((String) q.get("difficulty"))
                .tags(String.join(",", tags))
                .fetchedAt(Instant.now())
                .build());
    }

    // ── Contests ──────────────────────────────────────────────────────

    /** The next weekly and biweekly contests (and anything else LeetCode lists), soonest first. */
    private volatile List<Map<String, Object>> cachedContests = List.of();
    private volatile long cachedContestsAt = 0;

    /** Same as {@link #loadUpcomingContests()}, cached for 10 minutes. */
    public List<Map<String, Object>> upcomingContests() {
        long now = Instant.now().getEpochSecond();
        if (now - cachedContestsAt > 600 || cachedContests.isEmpty()) {
            cachedContests = loadUpcomingContests();
            cachedContestsAt = now;
        }
        long nowCheck = now;
        return cachedContests.stream()
                .filter(c -> ((long) c.get("startTime")) + ((long) c.get("duration")) >= nowCheck)
                .toList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadUpcomingContests() {
        long now = Instant.now().getEpochSecond();
        Map<String, Map<String, Object>> bySlug = new LinkedHashMap<>();

        try {
            Map<String, Object> data = leetCodeService.queryPublic("{ upcomingContests { title titleSlug startTime duration } }", Map.of());
            Object list = data.get("upcomingContests");
            if (list instanceof List<?> items) {
                for (Object item : items) {
                    Map<String, Object> c = (Map<String, Object>) item;
                    long start = ((Number) c.get("startTime")).longValue();
                    long duration = ((Number) c.getOrDefault("duration", CONTEST_DURATION)).longValue();
                    String slug = String.valueOf(c.get("titleSlug"));
                    bySlug.put(slug, contest(String.valueOf(c.get("title")), slug, start, duration,
                            slug.startsWith("biweekly") ? "biweekly" : "weekly"));
                }
            }
        } catch (Exception e) {
            log.warn("Could not load upcoming contests from LeetCode: {}", e.getMessage());
        }

        // Fill in from the fixed schedule, so both kinds always show even if LeetCode lists only one.
        addScheduled(bySlug, now, WEEKLY_ANCHOR_START, WEEKLY_ANCHOR_NUMBER, WEEK, "weekly", "Weekly Contest ", "weekly-contest-");
        addScheduled(bySlug, now, BIWEEKLY_ANCHOR_START, BIWEEKLY_ANCHOR_NUMBER, 2 * WEEK, "biweekly", "Biweekly Contest ", "biweekly-contest-");

        List<Map<String, Object>> out = new ArrayList<>(bySlug.values());
        out.removeIf(c -> ((long) c.get("startTime")) + ((long) c.get("duration")) < now);
        out.sort(Comparator.comparingLong(c -> (long) c.get("startTime")));
        return out;
    }

    private void addScheduled(Map<String, Map<String, Object>> into, long now, long anchor, int anchorNumber, long period,
                              String kind, String titlePrefix, String slugPrefix) {
        long steps = Math.max(0, (long) Math.ceil((now - CONTEST_DURATION - anchor) / (double) period));
        for (int i = 0; i < 2; i++) {
            long start = anchor + (steps + i) * period;
            int number = anchorNumber + (int) (steps + i);
            String slug = slugPrefix + number;
            into.putIfAbsent(slug, contest(titlePrefix + number, slug, start, CONTEST_DURATION, kind));
        }
    }

    private static Map<String, Object> contest(String title, String slug, long start, long duration, String kind) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("title", title);
        c.put("titleSlug", slug);
        c.put("startTime", start);
        c.put("duration", duration);
        c.put("kind", kind);
        c.put("url", "https://leetcode.com/contest/" + slug + "/");
        return c;
    }

    /** Contest rating summary and every attended contest, oldest first (public data). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> contestHistory(String username) {
        Map<String, Object> data = leetCodeService.queryPublic("""
                query contests($username: String!) {
                  userContestRanking(username: $username) { attendedContestsCount rating globalRanking totalParticipants topPercentage }
                  userContestRankingHistory(username: $username) {
                    attended rating ranking problemsSolved totalProblems
                    contest { title startTime }
                  }
                }
                """, Map.of("username", username));
        List<Map<String, Object>> attended = new ArrayList<>();
        Object history = data.get("userContestRankingHistory");
        if (history instanceof List<?> items) {
            for (Object item : items) {
                Map<String, Object> h = (Map<String, Object>) item;
                if (!Boolean.TRUE.equals(h.get("attended"))) continue;
                Map<String, Object> contest = (Map<String, Object>) h.get("contest");
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("title", contest == null ? "" : contest.get("title"));
                row.put("startTime", contest == null ? 0 : contest.get("startTime"));
                row.put("rating", h.get("rating"));
                row.put("ranking", h.get("ranking"));
                row.put("problemsSolved", h.get("problemsSolved"));
                row.put("totalProblems", h.get("totalProblems"));
                attended.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", data.get("userContestRanking"));
        out.put("history", attended);
        return out;
    }

    // ── Contest registration reminders ────────────────────────────────

    // Every minute: 24 hours and 2 hours before each contest, nudge users who haven't marked it registered.
    @Scheduled(cron = "30 * * * * *")
    public void remindToRegister() {
        long nowMinute = Instant.now().getEpochSecond() / 60;
        List<Map<String, Object>> contests;
        try {
            contests = upcomingContests();
        } catch (Exception e) {
            return;
        }
        for (Map<String, Object> c : contests) {
            long start = (long) c.get("startTime");
            for (long lead : REMINDER_LEADS) {
                if ((start - lead) / 60 != nowMinute) continue;
                String slug = (String) c.get("titleSlug");
                String title = (String) c.get("title");
                String when = lead >= 86_400 ? "starts in 24 hours" : "starts in 2 hours";
                for (User user : userRepository.findAll()) {
                    if (registrationRepository.existsByUserIdAndContestSlug(user.getId(), slug)) continue;
                    if (Boolean.TRUE.equals(user.getDesktopNudge())) {
                        desktopNudgeService.show("REGISTER FOR " + title, title + " " + when);
                    }
                }
                if (pushNotificationService != null) {
                    pushNotificationService.sendToAll("Register for " + title, title + " " + when + ". Register on LeetCode, then tick it off in prepboard.");
                }
            }
        }
    }
}
