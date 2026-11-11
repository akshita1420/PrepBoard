package com.preptracker.backend.service;

import com.preptracker.backend.model.AgentDevice;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.AgentDeviceRepository;
import com.preptracker.backend.repository.UserRepository;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * The desktop helper: a small script on a user's own Windows laptop that shows the pixel car.
 * It links once with a short code, then checks {@link #poll} every minute; the server decides when the car shows.
 */
@Service
public class AgentService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    private static final Duration CODE_LIFETIME = Duration.ofMinutes(15);
    // A nudge is still delivered if the helper checks within this long after its time (laptop waking, slow poll).
    private static final long DELIVERY_WINDOW_SECONDS = 180;
    private static final int MAX_REMEMBERED_KEYS = 12;

    private final SecureRandom random = new SecureRandom();
    private final UserRepository userRepository;
    private final AgentDeviceRepository deviceRepository;
    private final NotificationSchedulerService schedulerService;
    private final LeetCodeInsightsService insightsService;

    public AgentService(UserRepository userRepository, AgentDeviceRepository deviceRepository,
                        NotificationSchedulerService schedulerService, LeetCodeInsightsService insightsService) {
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
        this.schedulerService = schedulerService;
        this.insightsService = insightsService;
    }

    // ── Linking ───────────────────────────────────────────────────────

    /** A fresh one-time code the user types into the helper installer. */
    public Map<String, Object> createLinkCode(User user) {
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        user.setAgentLinkCode(code.toString());
        user.setAgentLinkCodeExpiresAt(Instant.now().plus(CODE_LIFETIME));
        userRepository.save(user);
        return Map.of("code", code.toString(), "expiresInMinutes", CODE_LIFETIME.toMinutes());
    }

    /** Exchanges a link code for the helper's long-lived secret token. */
    public Map<String, Object> link(String code, String deviceName) {
        String normalized = code == null ? "" : code.trim().toUpperCase().replace("-", "").replace(" ", "");
        User user = userRepository.findFirstByAgentLinkCode(normalized)
                .filter(u -> u.getAgentLinkCodeExpiresAt() != null && u.getAgentLinkCodeExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new IllegalArgumentException("That code is wrong or expired. Get a new one from the prepboard dashboard."));

        byte[] secret = new byte[32];
        random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);

        deviceRepository.save(AgentDevice.builder()
                .userId(user.getId())
                .name(deviceName == null || deviceName.isBlank() ? "Windows laptop" : deviceName.trim().substring(0, Math.min(60, deviceName.trim().length())))
                .tokenHash(sha256(token))
                .linkedAt(Instant.now())
                .lastSeenAt(Instant.now())
                .shownKeys("")
                .build());

        user.setAgentLinkCode(null);
        user.setAgentLinkCodeExpiresAt(null);
        user.setDesktopNudge(true);
        userRepository.save(user);

        return Map.of("token", token, "name", user.getName(), "leetcodeUsername", user.getLeetcodeUsername());
    }

    public List<Map<String, Object>> devicesFor(Long userId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentDevice d : deviceRepository.findByUserId(userId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", d.getId());
            row.put("name", d.getName());
            row.put("linkedAt", d.getLinkedAt());
            row.put("lastSeenAt", d.getLastSeenAt());
            out.add(row);
        }
        return out;
    }

    public void unlink(Long userId, Long deviceId) {
        deviceRepository.findById(deviceId).filter(d -> d.getUserId().equals(userId)).ifPresent(deviceRepository::delete);
    }

    /** Asks every helper of this user to show the car on its next check. Returns how many were asked. */
    public int requestPreview(Long userId) {
        List<AgentDevice> devices = deviceRepository.findByUserId(userId);
        devices.forEach(d -> d.setPreviewRequestedAt(Instant.now()));
        deviceRepository.saveAll(devices);
        return devices.size();
    }

    // ── Polling ───────────────────────────────────────────────────────

    /**
     * Called by the helper every minute. Returns {"show": true, "title", "subtitle"} when the car should drive now:
     * at the user's nudge time and at 9 pm (their time zone) if today's target isn't met, before contests they
     * haven't registered for, or right after they pressed "preview". Each event is delivered once per device.
     */
    public Map<String, Object> poll(String token) {
        AgentDevice device = deviceRepository.findByTokenHash(sha256(token == null ? "" : token))
                .orElseThrow(() -> new SecurityException("Unknown helper. Link it again from the dashboard."));
        User user = userRepository.findById(device.getUserId())
                .orElseThrow(() -> new SecurityException("This helper's account no longer exists."));

        Instant now = Instant.now();
        device.setLastSeenAt(now);
        Map<String, Object> result = due(user, device, now);
        deviceRepository.save(device);
        return result;
    }

    private Map<String, Object> due(User user, AgentDevice device, Instant now) {
        Set<String> shown = new LinkedHashSet<>(Arrays.asList((device.getShownKeys() == null ? "" : device.getShownKeys()).split(",")));
        shown.remove("");

        // Preview from the dashboard: within the last 2 minutes.
        if (device.getPreviewRequestedAt() != null && device.getPreviewRequestedAt().isAfter(now.minusSeconds(120))) {
            device.setPreviewRequestedAt(null);
            return show("COMPLETE LEETCODE", schedulerService.previewSubtitle(user));
        }

        if (!Boolean.TRUE.equals(user.getDesktopNudge())) return Map.of("show", false);

        ZoneId zone = NotificationSchedulerService.zoneFor(user);
        ZonedDateTime local = now.atZone(zone);

        // Daily nudges: own time and the compulsory 9 pm.
        List<LocalTime> times = new ArrayList<>();
        if (user.getNotificationTime() != null && !user.getNotificationTime().isBlank()) {
            try { times.add(LocalTime.parse(user.getNotificationTime())); } catch (Exception ignored) { }
        }
        if (!times.contains(NotificationSchedulerService.COMPULSORY_TIME)) times.add(NotificationSchedulerService.COMPULSORY_TIME);

        for (LocalTime time : times) {
            ZonedDateTime at = local.toLocalDate().atTime(time).atZone(zone);
            long since = ChronoUnit.SECONDS.between(at, local);
            String key = local.toLocalDate() + "T" + time;
            if (since < 0 || since > DELIVERY_WINDOW_SECONDS || shown.contains(key)) continue;

            int remaining = NotificationSchedulerService.DAILY_TARGET - schedulerService.solvedToday(user);
            remember(device, shown, key);
            if (remaining <= 0) continue; // target already hit: stay quiet
            boolean compulsoryOnly = time.equals(NotificationSchedulerService.COMPULSORY_TIME)
                    && !time.toString().equals(user.getNotificationTime());
            return show("COMPLETE LEETCODE", (compulsoryOnly ? "9 PM CHECK - " : "") + schedulerService.nudgeSubtitle(remaining));
        }

        // Contest registration reminders: 24 h and 2 h before, unless ticked off.
        long nowEpoch = now.getEpochSecond();
        for (Map<String, Object> c : insightsService.upcomingContests()) {
            long start = (long) c.get("startTime");
            String slug = (String) c.get("titleSlug");
            for (long lead : new long[]{24 * 3600L, 2 * 3600L}) {
                long since = nowEpoch - (start - lead);
                String key = slug + "-" + lead;
                if (since < 0 || since > DELIVERY_WINDOW_SECONDS || shown.contains(key)) continue;
                remember(device, shown, key);
                if (insightsService.isRegistered(user.getId(), slug)) continue;
                String title = (String) c.get("title");
                return show("REGISTER FOR " + title, title + (lead >= 86_400 ? " starts in 24 hours" : " starts in 2 hours"));
            }
        }
        return Map.of("show", false);
    }

    private static Map<String, Object> show(String title, String subtitle) {
        return Map.of("show", true, "title", title, "subtitle", subtitle);
    }

    private static void remember(AgentDevice device, Set<String> shown, String key) {
        shown.add(key);
        List<String> keys = new ArrayList<>(shown);
        if (keys.size() > MAX_REMEMBERED_KEYS) keys = keys.subList(keys.size() - MAX_REMEMBERED_KEYS, keys.size());
        device.setShownKeys(String.join(",", keys));
    }

    // ── Installer download ────────────────────────────────────────────

    /** Zip with the helper scripts, with this server's public address filled in. */
    public byte[] buildInstallerZip(String serverUrl) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            // Only two things at the top, so it's obvious what to double-click; the scripts live in "files".
            Map<String, String> entries = new LinkedHashMap<>();
            entries.put("INSTALL - double-click me.cmd", "agent/install.cmd");
            entries.put("README.txt", "agent/README.txt");
            entries.put("files/install.ps1", "agent/install.ps1");
            entries.put("files/agent.ps1", "agent/agent.ps1");
            entries.put("files/uninstall.cmd", "agent/uninstall.cmd");
            entries.put("files/README.txt", "agent/README.txt");
            entries.put("files/nudge-car.ps1", "desktop/nudge-car.ps1");
            for (Map.Entry<String, String> e : entries.entrySet()) {
                String text = read(e.getValue()).replace("__PREPBOARD_SERVER__", serverUrl);
                if (e.getKey().endsWith(".cmd")) text = text.replace("\r\n", "\n").replace("\n", "\r\n"); // cmd wants CRLF
                zip.putNextEntry(new ZipEntry("prepboard-helper/" + e.getKey()));
                zip.write(text.getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    /** One shell script for Linux (curl … | bash) with the helper files and this server's address inside. */
    public String buildLinuxInstaller(String serverUrl) throws IOException {
        java.util.function.Function<String, String> b64 = s -> Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
        return lf(read("agent-linux/install.sh"))
                .replace("__AGENT_B64__", b64.apply(lf(read("agent-linux/agent.py"))))
                .replace("__CAR_B64__", b64.apply(lf(read("agent-linux/nudge-car.py"))))
                .replace("__UNINSTALL_B64__", b64.apply(lf(read("agent-linux/uninstall.sh"))))
                .replace("__PREPBOARD_SERVER__", serverUrl);
    }

    // Linux scripts must have LF line endings, even if they were checked out on Windows.
    private static String lf(String text) {
        return text.replace("\r\n", "\n");
    }

    private static String read(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
