package com.preptracker.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.preptracker.backend.model.ProfileLink;
import com.preptracker.backend.repository.ProfileLinkRepository;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Coding profiles on other sites. Each platform is read from its public API or public profile page,
 * then normalised to {@link Stats}: total solved, a breakdown (easy/medium/hard where the site has one),
 * rating and rank.
 */
@Service
public class ProfileService {

    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);
    private static final Duration CACHE_FOR = Duration.ofHours(6);
    private static final String BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";
    private static final Pattern HANDLE = Pattern.compile("^[A-Za-z0-9_.\\-]{1,40}$");

    /** The sites prepboard can read. Order = order on the page. */
    public static final List<String> PLATFORMS = List.of("leetcode", "codeforces", "geeksforgeeks", "codechef", "github");

    public record Segment(String label, int count) {}

    public record Stats(String platform, String handle, String name, String avatar, String profileUrl,
                        int solved, List<Segment> breakdown, Integer rating, String rank, Map<String, Object> extra) {}

    public static class ProfileException extends RuntimeException {
        public final int status;

        public ProfileException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final ProfileLinkRepository repository;
    private final LeetCodeService leetCodeService;
    private final RestClient http = RestClient.builder().defaultHeader("User-Agent", BROWSER_UA).build();
    private final ObjectMapper json = new ObjectMapper();

    public ProfileService(ProfileLinkRepository repository, LeetCodeService leetCodeService) {
        this.repository = repository;
        this.leetCodeService = leetCodeService;
    }

    // ── Public API used by the controller ─────────────────────────────

    /** Looks a profile up without saving it (the "Is this you?" preview). */
    public Stats lookup(String platform, String handle) {
        String p = checkPlatform(platform);
        String h = checkHandle(handle);
        try {
            return switch (p) {
                case "leetcode" -> leetcode(h);
                case "codeforces" -> codeforces(h);
                case "geeksforgeeks" -> geeksforgeeks(h);
                case "codechef" -> codechef(h);
                case "github" -> github(h);
                default -> throw new ProfileException(400, "Unknown site.");
            };
        } catch (ProfileException e) {
            throw e;
        } catch (HttpClientErrorException.NotFound e) {
            throw new ProfileException(404, "No " + label(p) + " profile called \"" + h + "\".");
        } catch (Exception e) {
            log.warn("Profile lookup failed for {}/{}: {}", p, h, e.getMessage());
            throw new ProfileException(502, label(p) + " didn't answer. Try again in a minute.");
        }
    }

    public Stats connect(Long userId, String platform, String handle) {
        Stats stats = lookup(platform, handle);
        ProfileLink link = repository.findByUserIdAndPlatform(userId, stats.platform())
                .orElseGet(() -> ProfileLink.builder().userId(userId).platform(stats.platform()).connectedAt(Instant.now()).build());
        link.setHandle(stats.handle());
        save(link, stats);
        return stats;
    }

    public void disconnect(Long userId, String platform) {
        repository.findByUserIdAndPlatform(userId, platform).ifPresent(repository::delete);
    }

    /** Connected profiles with stats; stale ones (older than 6 h) are refreshed, or all of them when forced. */
    public List<Stats> profilesFor(Long userId, boolean refresh) {
        List<Stats> out = new ArrayList<>();
        for (ProfileLink link : repository.findByUserId(userId)) {
            Stats stats = read(link);
            boolean stale = link.getFetchedAt() == null || link.getFetchedAt().plus(CACHE_FOR).isBefore(Instant.now());
            if (refresh || stale || stats == null) {
                try {
                    stats = lookup(link.getPlatform(), link.getHandle());
                    save(link, stats);
                } catch (Exception e) {
                    // Keep showing the last good numbers if the site is down.
                    if (stats == null) continue;
                }
            }
            out.add(stats);
        }
        out.sort(Comparator.comparingInt(s -> PLATFORMS.indexOf(s.platform())));
        return out;
    }

    // ── Platforms ─────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Stats leetcode(String handle) {
        Map<String, Object> data = leetCodeService.queryPublic("""
                query profile($username: String!) {
                  matchedUser(username: $username) {
                    username
                    profile { realName userAvatar ranking }
                    submitStatsGlobal { acSubmissionNum { difficulty count } }
                  }
                  userContestRanking(username: $username) { rating globalRanking }
                }
                """, Map.of("username", handle));
        Map<String, Object> user = (Map<String, Object>) data.get("matchedUser");
        if (user == null) throw new ProfileException(404, "No LeetCode profile called \"" + handle + "\".");
        Map<String, Object> profile = (Map<String, Object>) user.getOrDefault("profile", Map.of());
        Map<String, Integer> counts = new HashMap<>();
        Map<String, Object> submit = (Map<String, Object>) user.get("submitStatsGlobal");
        if (submit != null) {
            for (Object o : (List<Object>) submit.get("acSubmissionNum")) {
                Map<String, Object> row = (Map<String, Object>) o;
                counts.put(String.valueOf(row.get("difficulty")), ((Number) row.get("count")).intValue());
            }
        }
        Map<String, Object> contest = (Map<String, Object>) data.get("userContestRanking");
        Integer rating = contest == null || contest.get("rating") == null ? null : (int) Math.round(((Number) contest.get("rating")).doubleValue());
        Object globalRank = contest != null && contest.get("globalRanking") != null ? contest.get("globalRanking") : profile.get("ranking");
        String login = String.valueOf(user.get("username"));
        return new Stats("leetcode", login, blankToNull((String) profile.get("realName"), login),
                (String) profile.get("userAvatar"), "https://leetcode.com/u/" + login + "/",
                counts.getOrDefault("All", 0),
                List.of(new Segment("easy", counts.getOrDefault("Easy", 0)),
                        new Segment("medium", counts.getOrDefault("Medium", 0)),
                        new Segment("hard", counts.getOrDefault("Hard", 0))),
                rating, globalRank == null ? null : "#" + String.format("%,d", ((Number) globalRank).longValue()), Map.of());
    }

    @SuppressWarnings("unchecked")
    private Stats codeforces(String handle) {
        Map<String, Object> info = http.get().uri("https://codeforces.com/api/user.info?handles={h}", handle).retrieve()
                .onStatus(s -> s.value() == 400, (req, res) -> { throw new ProfileException(404, "No Codeforces profile called \"" + handle + "\"."); })
                .body(Map.class);
        List<Map<String, Object>> users = info == null ? List.of() : (List<Map<String, Object>>) info.get("result");
        if (users == null || users.isEmpty()) throw new ProfileException(404, "No Codeforces profile called \"" + handle + "\".");
        Map<String, Object> u = users.get(0);

        // Solved = distinct problems with an accepted submission. Difficulty comes from each problem's rating.
        Map<String, Object> status = http.get().uri("https://codeforces.com/api/user.status?handle={h}", handle).retrieve().body(Map.class);
        Set<String> seen = new HashSet<>();
        int easy = 0, medium = 0, hard = 0, unrated = 0;
        for (Map<String, Object> sub : (List<Map<String, Object>>) status.getOrDefault("result", List.of())) {
            if (!"OK".equals(sub.get("verdict"))) continue;
            Map<String, Object> problem = (Map<String, Object>) sub.get("problem");
            String key = problem.get("contestId") + "-" + problem.get("index") + "-" + problem.get("name");
            if (!seen.add(key)) continue;
            Object r = problem.get("rating");
            if (r == null) unrated++;
            else if (((Number) r).intValue() <= 1200) easy++;
            else if (((Number) r).intValue() <= 1900) medium++;
            else hard++;
        }
        List<Segment> breakdown = new ArrayList<>(List.of(new Segment("easy", easy), new Segment("medium", medium), new Segment("hard", hard)));
        if (unrated > 0) breakdown.add(new Segment("unrated", unrated));
        String login = String.valueOf(u.get("handle"));
        String name = (String.valueOf(u.getOrDefault("firstName", "")) + " " + u.getOrDefault("lastName", "")).replace("null", "").trim();
        return new Stats("codeforces", login, blankToNull(name, login), (String) u.get("titlePhoto"),
                "https://codeforces.com/profile/" + login, seen.size(), breakdown,
                u.get("rating") == null ? null : ((Number) u.get("rating")).intValue(), (String) u.get("rank"),
                Map.of("maxRating", u.getOrDefault("maxRating", ""), "difficultyNote", "by problem rating: easy up to 1200, medium up to 1900, hard above"));
    }

    @SuppressWarnings("unchecked")
    private Stats geeksforgeeks(String handle) {
        Map<String, Object> res = http.get()
                .uri("https://authapi.geeksforgeeks.org/api-get/user-profile-info/?handle={h}&article_count=false&redirect=true", handle)
                .retrieve().onStatus(s -> s.value() == 404 || s.value() == 400, (req, r) -> {
                    throw new ProfileException(404, "No GeeksforGeeks profile called \"" + handle + "\".");
                }).body(Map.class);
        Map<String, Object> d = res == null ? null : (Map<String, Object>) res.get("data");
        if (d == null) throw new ProfileException(404, "No GeeksforGeeks profile called \"" + handle + "\".");

        // Difficulty split from the practice API (School + Basic count as easy). Not every profile returns it.
        List<Segment> breakdown = new ArrayList<>();
        try {
            Map<String, Object> p = http.post().uri("https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("handle", handle, "requestType", "", "year", "", "month", ""))
                    .retrieve().body(Map.class);
            Object result = p == null ? null : p.get("result");
            if (result instanceof Map<?, ?> byLevel && !byLevel.isEmpty()) {
                int easy = size(byLevel.get("School")) + size(byLevel.get("Basic")) + size(byLevel.get("Easy"));
                breakdown.add(new Segment("easy", easy));
                breakdown.add(new Segment("medium", size(byLevel.get("Medium"))));
                breakdown.add(new Segment("hard", size(byLevel.get("Hard"))));
            }
        } catch (Exception ignored) {
            // total only
        }
        int solved = d.get("total_problems_solved") == null ? 0 : ((Number) d.get("total_problems_solved")).intValue();
        Object score = d.get("score");
        return new Stats("geeksforgeeks", handle, blankToNull((String) d.get("name"), handle), (String) d.get("profile_image_url"),
                "https://www.geeksforgeeks.org/user/" + handle + "/", solved, breakdown,
                null, d.get("institute_rank") == null || String.valueOf(d.get("institute_rank")).isBlank() ? null : "institute #" + d.get("institute_rank"),
                Map.of("codingScore", score == null ? 0 : score));
    }

    private Stats codechef(String handle) throws Exception {
        Document page = Jsoup.connect("https://www.codechef.com/users/" + handle).userAgent(BROWSER_UA).timeout(20000).get();
        Element nameEl = page.selectFirst("h1.h2-style");
        if (nameEl == null || page.location().contains("/users/") && page.selectFirst(".rating-number") == null && page.text().contains("could not be found")) {
            throw new ProfileException(404, "No CodeChef profile called \"" + handle + "\".");
        }
        String html = page.html();
        int solved = firstInt(html, "Total Problems Solved:\\s*(\\d+)", 0);
        Element ratingEl = page.selectFirst(".rating-number");
        Integer rating = ratingEl == null ? null : parseIntOrNull(ratingEl.ownText());
        Element star = page.selectFirst(".rating-star");
        int stars = star == null ? 0 : star.select("span").size();
        Element globalRank = page.selectFirst(".global-rank");
        Element img = page.selectFirst(".user-details-container img.profileImage, header img.profileImage, img.profileImage");
        return new Stats("codechef", handle, nameEl == null ? handle : nameEl.text().trim(),
                img == null ? null : img.absUrl("src"), "https://www.codechef.com/users/" + handle, solved, List.of(),
                rating, globalRank == null ? null : "#" + globalRank.text().trim(),
                Map.of("stars", stars));
    }

    @SuppressWarnings("unchecked")
    private Stats github(String handle) {
        Map<String, Object> u = http.get().uri("https://api.github.com/users/{h}", handle)
                .header("Accept", "application/vnd.github+json").retrieve().body(Map.class);
        if (u == null || u.get("login") == null) throw new ProfileException(404, "No GitHub profile called \"" + handle + "\".");
        String login = String.valueOf(u.get("login"));
        return new Stats("github", login, blankToNull((String) u.get("name"), login), (String) u.get("avatar_url"),
                (String) u.get("html_url"), 0, List.of(), null, null,
                Map.of("repos", u.getOrDefault("public_repos", 0), "followers", u.getOrDefault("followers", 0)));
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private void save(ProfileLink link, Stats stats) {
        try {
            link.setStatsJson(json.writeValueAsString(stats));
        } catch (Exception e) {
            link.setStatsJson(null);
        }
        link.setFetchedAt(Instant.now());
        repository.save(link);
    }

    private Stats read(ProfileLink link) {
        if (link.getStatsJson() == null) return null;
        try {
            return json.readValue(link.getStatsJson(), Stats.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static String checkPlatform(String platform) {
        String p = platform == null ? "" : platform.trim().toLowerCase(Locale.ROOT);
        if (!PLATFORMS.contains(p)) throw new ProfileException(400, "That site isn't supported yet.");
        return p;
    }

    private static String checkHandle(String handle) {
        String h = handle == null ? "" : handle.trim();
        // Accept a pasted profile link too: keep the last part of the path.
        if (h.contains("/")) {
            String[] parts = h.replaceAll("[?#].*$", "").split("/");
            for (int i = parts.length - 1; i >= 0; i--) {
                if (!parts[i].isBlank()) { h = parts[i]; break; }
            }
        }
        if (!HANDLE.matcher(h).matches()) throw new ProfileException(400, "Enter a username (letters, numbers, _ . -).");
        return h;
    }

    private static String label(String platform) {
        return switch (platform) {
            case "leetcode" -> "LeetCode";
            case "codeforces" -> "Codeforces";
            case "geeksforgeeks" -> "GeeksforGeeks";
            case "codechef" -> "CodeChef";
            case "github" -> "GitHub";
            default -> platform;
        };
    }

    private static int size(Object byLevelEntry) {
        return byLevelEntry instanceof Map<?, ?> m ? m.size() : 0;
    }

    private static String blankToNull(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static int firstInt(String text, String regex, int fallback) {
        Matcher m = Pattern.compile(regex).matcher(text);
        return m.find() ? Integer.parseInt(m.group(1)) : fallback;
    }

    private static Integer parseIntOrNull(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return null;
        }
    }
}
