package com.preptracker.backend.service;

import com.preptracker.backend.dto.LeetCodeResponseDto;
import com.preptracker.backend.dto.RecentSubmissionDto;
import com.preptracker.backend.dto.SolvedQuestionDto;
import com.preptracker.backend.dto.SubmissionHistoryDto;
import com.preptracker.backend.dto.UserProgressQuestionListDto;
import com.preptracker.backend.model.LeetCodeLog;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.LeetCodeLogRepository;
import com.preptracker.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LeetCodeService {

    private static final Logger log = LoggerFactory.getLogger(LeetCodeService.class);

    // LeetCode serves at most 20 submissions per page, and only the last 20 accepted ones without a login.
    private static final int SUBMISSION_PAGE_SIZE = 20;
    private static final int MAX_SUBMISSION_PAGES = 500;
    private static final long PAGE_DELAY_MS = 350;
    private static final int MAX_DIFFICULTY_LOOKUPS_PER_SYNC = 60;

    /** A LeetCode login (the browser's LEETCODE_SESSION and csrftoken cookies). */
    public record LeetCodeCredentials(String session, String csrfToken) {
        static LeetCodeCredentials of(String session, String csrfToken) {
            String s = session == null ? null : session.trim();
            String c = csrfToken == null ? null : csrfToken.trim();
            if (s == null || s.isBlank()) return null;
            return new LeetCodeCredentials(s, c == null || c.isBlank() ? null : c);
        }
    }

    private final RestClient restClient;
    private final LeetCodeLogRepository logRepository;
    private final UserRepository userRepository;
    // Optional fallback login from environment variables, used only for its own account.
    private final LeetCodeCredentials envCredentials;
    private final Map<String, String> difficultyCache = new ConcurrentHashMap<>();
    private final Map<String, Object> syncLocks = new ConcurrentHashMap<>();

    public LeetCodeService(LeetCodeLogRepository logRepository, UserRepository userRepository) {
        this.logRepository = logRepository;
        this.userRepository = userRepository;
        this.restClient = RestClient.builder()
                .baseUrl("https://leetcode.com/graphql/")
                .defaultHeader("User-Agent", "Mozilla/5.0")
                .defaultHeader("Origin", "https://leetcode.com")
                .defaultHeader("Referer", "https://leetcode.com/progress/")
                .build();
        this.envCredentials = LeetCodeCredentials.of(System.getenv("LEETCODE_SESSION"), System.getenv("LEETCODE_CSRF_TOKEN"));
    }

    private <T> T postGraphQl(String query, Map<String, Object> variables, Class<T> responseType) {
        return postGraphQl(query, variables, responseType, null);
    }

    private <T> T postGraphQl(String query, Map<String, Object> variables, Class<T> responseType, LeetCodeCredentials credentials) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("query", query);
        requestBody.put("variables", variables);
        RestClient.RequestBodySpec request = restClient.post().contentType(MediaType.APPLICATION_JSON);
        if (credentials != null) {
            String cookie = "LEETCODE_SESSION=" + credentials.session();
            if (credentials.csrfToken() != null) {
                cookie += "; csrftoken=" + credentials.csrfToken();
                request = request.header("x-csrftoken", credentials.csrfToken());
            }
            request = request.header("Cookie", cookie);
        }
        return request.body(requestBody).retrieve().body(responseType);
    }

    /** The login to use for this LeetCode user: their own saved cookie, else the environment one. */
    private LeetCodeCredentials credentialsFor(String username) {
        for (User user : userRepository.findByLeetcodeUsernameIgnoreCase(username)) {
            LeetCodeCredentials saved = LeetCodeCredentials.of(user.getLeetcodeSession(), user.getLeetcodeCsrfToken());
            if (saved != null) return saved;
        }
        return envCredentials;
    }

    /** The LeetCode username these cookies are signed in as, or null if they are not signed in. */
    @SuppressWarnings("unchecked")
    public String signedInUsername(LeetCodeCredentials credentials) {
        if (credentials == null) return null;
        try {
            Map<String, Object> response = postGraphQl("query { userStatus { username isSignedIn } }", Map.of(), Map.class, credentials);
            Map<String, Object> data = response == null ? null : (Map<String, Object>) response.get("data");
            Map<String, Object> status = data == null ? null : (Map<String, Object>) data.get("userStatus");
            if (status == null || !Boolean.TRUE.equals(status.get("isSignedIn"))) return null;
            Object name = status.get("username");
            return name == null ? null : String.valueOf(name);
        } catch (Exception e) {
            log.warn("Could not check LeetCode login: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Saves a user's LeetCode cookies after checking they log in to that user's own LeetCode account.
     * The next sync then imports their full history.
     */
    public void connectSession(User user, String session, String csrfToken) {
        LeetCodeCredentials credentials = LeetCodeCredentials.of(session, csrfToken);
        if (credentials == null) throw new IllegalArgumentException("Paste the LEETCODE_SESSION cookie value.");
        String signedInAs = signedInUsername(credentials);
        if (signedInAs == null) {
            throw new IllegalArgumentException("LeetCode did not accept this cookie. Copy it again from a logged-in leetcode.com tab.");
        }
        if (!signedInAs.equalsIgnoreCase(user.getLeetcodeUsername())) {
            throw new IllegalArgumentException("This cookie is for LeetCode user '" + signedInAs + "', not '" + user.getLeetcodeUsername() + "'.");
        }
        user.setLeetcodeSession(credentials.session());
        user.setLeetcodeCsrfToken(credentials.csrfToken());
        user.setHistoryImportedAt(null);
        userRepository.save(user);
    }

    public void disconnectSession(User user) {
        user.setLeetcodeSession(null);
        user.setLeetcodeCsrfToken(null);
        userRepository.save(user);
    }

    /** Runs a public (no login) LeetCode GraphQL query and returns its "data" object. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> queryPublic(String query, Map<String, Object> variables) {
        Map<String, Object> response = postGraphQl(query, variables, Map.class);
        Object data = response == null ? null : response.get("data");
        return data instanceof Map ? (Map<String, Object>) data : Map.of();
    }

    public LeetCodeResponseDto fetchLeetCodeStats(String username) {
        String graphqlQuery = """
            query getUserProfile($username: String!) {
              matchedUser(username: $username) {
                username
                submitStats {
                  acSubmissionNum {
                    difficulty
                    count
                  }
                }
                userCalendar {
                  streak
                  submissionCalendar
                }
              }
            }
            """;
        return postGraphQl(graphqlQuery, Map.of("username", username), LeetCodeResponseDto.class);
    }

    public RecentSubmissionDto fetchRecentSubmissions(String username) {
        String graphqlQuery = """
            query recentAcSubmissions($username: String!, $limit: Int!) {
              recentAcSubmissionList(username: $username, limit: $limit) {
                id
                title
                titleSlug
                timestamp
              }
            }
            """;
        return postGraphQl(graphqlQuery, Map.of("username", username, "limit", SUBMISSION_PAGE_SIZE), RecentSubmissionDto.class);
    }

    /**
     * The login that can read this user's private history, or null.
     * Logged-in queries return the cookie owner's data, so a cookie is only used for its own account.
     */
    private LeetCodeCredentials verifiedCredentialsFor(String username) {
        LeetCodeCredentials credentials = credentialsFor(username);
        if (credentials == null) return null;
        String signedInAs = signedInUsername(credentials);
        if (signedInAs == null) {
            log.warn("Saved LeetCode login for {} is no longer signed in (cookie expired?).", username);
            return null;
        }
        return signedInAs.equalsIgnoreCase(username) ? credentials : null;
    }

    private UserProgressQuestionListDto.QuestionList fetchAllSolvedQuestions(LeetCodeCredentials credentials) {
        String graphqlQuery = """
            query userProgressQuestionList($filters: UserProgressQuestionListInput) {
              userProgressQuestionList(filters: $filters) {
                totalNum
                questions {
                  frontendId
                  title
                  titleSlug
                  difficulty
                  lastSubmittedAt
                  topicTags {
                    name
                  }
                }
              }
            }
            """;

        UserProgressQuestionListDto.QuestionList allQuestions = new UserProgressQuestionListDto.QuestionList();
        int skip = 0;
        final int pageSize = 400;

        do {
            Map<String, Object> filters = Map.of(
                    "questionStatus", "SOLVED",
                    "skip", skip,
                    "limit", pageSize
            );
            UserProgressQuestionListDto response = postGraphQl(graphqlQuery, Map.of("filters", filters), UserProgressQuestionListDto.class, credentials);

            UserProgressQuestionListDto.QuestionList page = response == null || response.getData() == null
                    ? null : response.getData().getUserProgressQuestionList();
            if (page == null) {
                String errors = response == null || response.getErrors() == null ? "no response" : response.getErrors().stream()
                        .map(UserProgressQuestionListDto.GraphQlError::getMessage)
                        .filter(message -> message != null && !message.isBlank())
                        .reduce((left, right) -> left + "; " + right)
                        .orElse("not signed in");
                throw new IllegalStateException("LeetCode userProgressQuestionList failed: " + errors);
            }

            if (skip == 0) allQuestions.setTotalNum(page.getTotalNum());
            if (page.getQuestions() != null) allQuestions.getQuestions().addAll(page.getQuestions());
            skip += page.getQuestions() == null ? 0 : page.getQuestions().size();

            if (page.getQuestions() == null || page.getQuestions().isEmpty()) break;
        } while (skip < allQuestions.getTotalNum());

        return allQuestions;
    }

    /**
     * Pages through the signed-in user's whole submission history and keeps the accepted ones.
     * Stops early once it reaches submissions older than {@code stopBefore} (epoch seconds), when given.
     *
     * @return the accepted solves, and whether the very first submission was reached
     */
    private record HistoryResult(List<SolvedQuestionDto> solves, boolean complete) {}

    private HistoryResult fetchAcceptedSubmissionHistory(LeetCodeCredentials credentials, Long stopBefore) {
        String graphqlQuery = """
            query submissionList($offset: Int!, $limit: Int!, $lastKey: String) {
              submissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
                lastKey
                hasNext
                submissions {
                  id
                  title
                  titleSlug
                  timestamp
                  statusDisplay
                }
              }
            }
            """;

        List<SolvedQuestionDto> solves = new ArrayList<>();
        String lastKey = null;
        int offset = 0;

        for (int page = 0; page < MAX_SUBMISSION_PAGES; page++) {
            Map<String, Object> variables = new HashMap<>();
            variables.put("offset", offset);
            variables.put("limit", SUBMISSION_PAGE_SIZE);
            variables.put("lastKey", lastKey);

            SubmissionHistoryDto response;
            try {
                response = postGraphQl(graphqlQuery, variables, SubmissionHistoryDto.class, credentials);
            } catch (Exception e) {
                // Usually rate limiting. Keep what we have; the next sync carries on.
                log.warn("Stopped reading LeetCode submission history at page {}: {}", page, e.getMessage());
                return new HistoryResult(solves, false);
            }

            SubmissionHistoryDto.SubmissionList list = response == null || response.data() == null
                    ? null : response.data().submissionList();
            if (list == null || list.submissions() == null) return new HistoryResult(solves, false);

            boolean reachedStop = false;
            for (SubmissionHistoryDto.Submission submission : list.submissions()) {
                long ts = parseEpochSeconds(submission.timestamp());
                if (stopBefore != null && ts > 0 && ts < stopBefore) {
                    reachedStop = true;
                    break;
                }
                if ("Accepted".equalsIgnoreCase(submission.statusDisplay()) && ts > 0 && submission.titleSlug() != null) {
                    solves.add(new SolvedQuestionDto(submission.title(), submission.titleSlug(), null, ts));
                }
            }

            if (reachedStop) return new HistoryResult(solves, false);
            if (!list.hasNext() || list.submissions().isEmpty()) return new HistoryResult(solves, true);

            lastKey = list.lastKey();
            offset += list.submissions().size();
            sleepQuietly(PAGE_DELAY_MS);
        }
        return new HistoryResult(solves, false);
    }

    /**
     * Every accepted solve we can get from LeetCode for this user, one entry per question per day.
     * Uses the full history when LEETCODE_SESSION belongs to this user, otherwise the public last 20.
     */
    public List<SolvedQuestionDto> fetchSolvedTimeline(String username) {
        return fetchSolvedTimeline(username, null).solves();
    }

    private HistoryResult fetchSolvedTimeline(String username, Long stopBefore) {
        List<SolvedQuestionDto> collected = new ArrayList<>();
        Map<String, String> difficultyBySlug = new HashMap<>();
        boolean complete = false;

        LeetCodeCredentials credentials = verifiedCredentialsFor(username);
        if (credentials != null) {
            HistoryResult history = fetchAcceptedSubmissionHistory(credentials, stopBefore);
            collected.addAll(history.solves());
            complete = history.complete();

            try {
                for (UserProgressQuestionListDto.Question question : fetchAllSolvedQuestions(credentials).getQuestions()) {
                    if (question.getTitleSlug() == null) continue;
                    if (question.getDifficulty() != null) difficultyBySlug.put(question.getTitleSlug(), question.getDifficulty());
                    long ts = parseIsoToEpochSeconds(question.getLastSubmittedAt());
                    if (ts > 0 && (stopBefore == null || ts >= stopBefore)) {
                        collected.add(new SolvedQuestionDto(question.getTitle(), question.getTitleSlug(), question.getDifficulty(), ts));
                    }
                }
            } catch (Exception e) {
                log.warn("Could not read LeetCode solved-question list: {}", e.getMessage());
            }
        }

        try {
            RecentSubmissionDto recent = fetchRecentSubmissions(username);
            if (recent != null && recent.data() != null && recent.data().recentAcSubmissionList() != null) {
                for (RecentSubmissionDto.Submission submission : recent.data().recentAcSubmissionList()) {
                    long ts = parseEpochSeconds(submission.timestamp());
                    if (ts > 0 && submission.titleSlug() != null) {
                        collected.add(new SolvedQuestionDto(submission.title(), submission.titleSlug(), null, ts));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not read recent LeetCode submissions for {}: {}", username, e.getMessage());
        }

        // One entry per question per UTC day, keeping the earliest solve that day.
        Map<String, SolvedQuestionDto> unique = new LinkedHashMap<>();
        collected.stream()
                .sorted(Comparator.comparingLong(SolvedQuestionDto::timestamp))
                .forEach(solve -> unique.putIfAbsent(solve.titleSlug() + "|" + toUtcDate(solve.timestamp()), solve));

        List<SolvedQuestionDto> result = fillDifficulties(new ArrayList<>(unique.values()), difficultyBySlug);
        result.sort(Comparator.comparingLong(SolvedQuestionDto::timestamp).reversed());
        return new HistoryResult(result, complete);
    }

    private List<SolvedQuestionDto> fillDifficulties(List<SolvedQuestionDto> solves, Map<String, String> known) {
        int lookups = 0;
        List<SolvedQuestionDto> out = new ArrayList<>(solves.size());
        for (SolvedQuestionDto solve : solves) {
            String difficulty = solve.difficulty();
            if (difficulty == null) difficulty = known.get(solve.titleSlug());
            if (difficulty == null) difficulty = difficultyCache.get(solve.titleSlug());
            if (difficulty == null && lookups < MAX_DIFFICULTY_LOOKUPS_PER_SYNC) {
                lookups++;
                difficulty = lookUpDifficulty(solve.titleSlug());
            }
            if (difficulty != null) difficultyCache.put(solve.titleSlug(), difficulty);
            out.add(solve.withDifficulty(difficulty));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private String lookUpDifficulty(String titleSlug) {
        try {
            Map<String, Object> response = postGraphQl(
                    "query questionDifficulty($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }",
                    Map.of("titleSlug", titleSlug), Map.class);
            Map<String, Object> data = response == null ? null : (Map<String, Object>) response.get("data");
            Map<String, Object> question = data == null ? null : (Map<String, Object>) data.get("question");
            return question == null ? null : (String) question.get("difficulty");
        } catch (Exception e) {
            return null;
        }
    }

    // Sync submissions to PostgreSQL. Saved logs build up over time, so the calendar keeps
    // older days even when LeetCode only exposes the latest 20 solves.
    public List<LeetCodeLog> syncAndSaveSubmissions(String username) {
        // One sync per LeetCode account at a time, so the hourly job and the page don't save the same solve twice.
        Object lock = syncLocks.computeIfAbsent(username.toLowerCase(), key -> new Object());
        synchronized (lock) {
            return doSyncAndSave(username);
        }
    }

    private List<LeetCodeLog> doSyncAndSave(String username) {
        // Prefer the account that has a LeetCode login saved (two accounts can share a username).
        List<User> matches = userRepository.findByLeetcodeUsernameIgnoreCase(username);
        User user = matches.stream().filter(User::isLeetcodeConnected).findFirst()
                .or(() -> matches.stream().findFirst())
                .or(() -> userRepository.findFirstByEmail(username))
                .orElseThrow(() -> new RuntimeException("User not found with username: " + username));

        List<LeetCodeLog> existing = logRepository.findByUserId(user.getId());

        // After the full history has been imported once, only read pages newer than the latest saved solve (minus a day of overlap).
        Long stopBefore = null;
        if (user.getHistoryImportedAt() != null) {
            stopBefore = existing.stream()
                    .map(LeetCodeLog::getSolvedTimestamp)
                    .filter(ts -> ts != null)
                    .max(Long::compare)
                    .map(ts -> ts - 86_400)
                    .orElse(null);
        }

        HistoryResult timeline = fetchSolvedTimeline(user.getLeetcodeUsername(), stopBefore);

        Map<String, LeetCodeLog> existingByKey = new HashMap<>();
        for (LeetCodeLog saved : existing) {
            existingByKey.put(saved.getTitleSlug() + "|" + saved.getSolvedAt(), saved);
        }

        List<LeetCodeLog> toSave = new ArrayList<>();
        for (SolvedQuestionDto solve : timeline.solves()) {
            LocalDate solvedAt = toUtcDate(solve.timestamp());
            String key = solve.titleSlug() + "|" + solvedAt;
            LeetCodeLog saved = existingByKey.get(key);
            if (saved != null) {
                // Fill in fields that older rows were saved without.
                boolean changed = false;
                if (saved.getSolvedTimestamp() == null) { saved.setSolvedTimestamp(solve.timestamp()); changed = true; }
                if (saved.getDifficulty() == null && solve.difficulty() != null) { saved.setDifficulty(solve.difficulty()); changed = true; }
                if (changed) toSave.add(saved);
                continue;
            }
            LeetCodeLog newLog = new LeetCodeLog();
            newLog.setProblemTitle(solve.title());
            newLog.setTitleSlug(solve.titleSlug());
            newLog.setProblemUrl("https://leetcode.com/problems/" + solve.titleSlug());
            newLog.setDifficulty(solve.difficulty());
            newLog.setSolvedAt(solvedAt);
            newLog.setSolvedTimestamp(solve.timestamp());
            newLog.setUser(user);
            existingByKey.put(key, newLog);
            toSave.add(newLog);
        }

        if (!toSave.isEmpty()) {
            logRepository.saveAll(toSave);
        }
        if (timeline.complete() && user.getHistoryImportedAt() == null) {
            user.setHistoryImportedAt(Instant.now());
            userRepository.save(user);
        }

        // Same list as GET /logs/{username}, so the calendar doesn't shrink after a sync.
        return logRepository.findByUserLeetcodeUsernameIgnoreCase(user.getLeetcodeUsername());
    }

    private static long parseEpochSeconds(String value) {
        if (value == null || value.isBlank()) return 0;
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static long parseIsoToEpochSeconds(String value) {
        if (value == null || value.isBlank()) return 0;
        try {
            return OffsetDateTime.parse(value).toEpochSecond();
        } catch (DateTimeParseException ignored) {
            try {
                return LocalDate.parse(value).atTime(12, 0).toEpochSecond(ZoneOffset.UTC);
            } catch (DateTimeParseException ignoredDate) {
                return parseEpochSeconds(value);
            }
        }
    }

    private static LocalDate toUtcDate(long epochSeconds) {
        return Instant.ofEpochSecond(epochSeconds).atOffset(ZoneOffset.UTC).toLocalDate();
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
