package com.preptracker.backend.controller;

import com.preptracker.backend.model.ContestRegistration;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.ContestRegistrationRepository;
import com.preptracker.backend.repository.UserRepository;
import com.preptracker.backend.service.AgentService;
import com.preptracker.backend.service.LeetCodeService;
import com.preptracker.backend.service.NotificationSchedulerService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserRepository userRepository;
    private final LeetCodeService leetCodeService;
    private final NotificationSchedulerService notificationSchedulerService;
    private final ContestRegistrationRepository registrationRepository;
    private final AgentService agentService;

    public UserController(UserRepository userRepository, LeetCodeService leetCodeService,
                          NotificationSchedulerService notificationSchedulerService,
                          ContestRegistrationRepository registrationRepository,
                          AgentService agentService) {
        this.userRepository = userRepository;
        this.leetCodeService = leetCodeService;
        this.notificationSchedulerService = notificationSchedulerService;
        this.registrationRepository = registrationRepository;
        this.agentService = agentService;
    }

    // 10. One-time code to link the desktop helper on a laptop
    @PostMapping("/{id}/agent/code")
    public ResponseEntity<?> agentLinkCode(@PathVariable Long id) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(user -> ResponseEntity.ok(agentService.createLinkCode(user)))
                .orElse(ResponseEntity.notFound().build());
    }

    // 11. Laptops with the desktop helper linked to this user
    @GetMapping("/{id}/agents")
    public List<Map<String, Object>> agents(@PathVariable Long id) {
        return agentService.devicesFor(id);
    }

    @DeleteMapping("/{id}/agents/{deviceId}")
    public ResponseEntity<?> unlinkAgent(@PathVariable Long id, @PathVariable Long deviceId) {
        agentService.unlink(id, deviceId);
        return ResponseEntity.ok(Map.of("unlinked", true));
    }

    // Accounts are created and opened through /api/auth (email + password).

    public record LeetCodeSessionRequest(String session, String csrfToken) {}

    // 4. Save the user's own LeetCode login cookies so their full history can be imported
    @PutMapping("/{id}/leetcode-session")
    public ResponseEntity<?> connectLeetCode(@PathVariable Long id, @RequestBody LeetCodeSessionRequest request) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(user -> {
                    try {
                        leetCodeService.connectSession(user, request.session(), request.csrfToken());
                        return ResponseEntity.ok(user);
                    } catch (IllegalArgumentException e) {
                        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
                    }
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 5. Forget the user's LeetCode login cookies (already imported history stays)
    @DeleteMapping("/{id}/leetcode-session")
    public ResponseEntity<User> disconnectLeetCode(@PathVariable Long id) {
        return userRepository.findById(id)
                .map(user -> {
                    leetCodeService.disconnectSession(user);
                    return ResponseEntity.ok(user);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    public record NudgeRequest(String time, Boolean desktop, String timezone) {}

    // 6. Save the daily nudge time and whether to show the desktop car banner
    @PutMapping("/{id}/nudge")
    public ResponseEntity<?> saveNudge(@PathVariable Long id, @RequestBody NudgeRequest request) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(user -> {
                    if (request.time() != null) {
                        try {
                            user.setNotificationTime(java.time.LocalTime.parse(request.time()).toString());
                        } catch (java.time.format.DateTimeParseException e) {
                            return ResponseEntity.badRequest().body(Map.of("error", "Time must look like 19:30."));
                        }
                    }
                    if (request.desktop() != null) user.setDesktopNudge(request.desktop());
                    if (request.timezone() != null && !request.timezone().isBlank()) {
                        try {
                            user.setTimezone(java.time.ZoneId.of(request.timezone()).getId());
                        } catch (Exception ignored) {
                            // keep the old zone if the browser sent something unknown
                        }
                    }
                    return ResponseEntity.ok(userRepository.save(user));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 7. Show the desktop car banner right now (preview)
    @PostMapping("/{id}/nudge/test")
    public ResponseEntity<?> testNudge(@PathVariable Long id) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(user -> {
                    // Helpers show it on their next check (within a minute); the backend's own PC shows it now.
                    int helpers = agentService.requestPreview(user.getId());
                    boolean local = notificationSchedulerService.showsLocally(user) && notificationSchedulerService.showDesktopNudge(user);
                    if (helpers == 0 && !local) {
                        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("shown", false,
                                "error", "Install the desktop helper on your laptop first, then press preview again."));
                    }
                    return ResponseEntity.ok(Map.of("shown", true, "helpers", helpers, "local", local));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 8. Contests the user has said they registered for
    @GetMapping("/{id}/contests/registered")
    public List<String> registeredContests(@PathVariable Long id) {
        return registrationRepository.findByUserId(id).stream().map(ContestRegistration::getContestSlug).toList();
    }

    // 9. "Yes, I registered" for a contest (stops its reminders)
    @PutMapping("/{id}/contests/{slug}/registered")
    public ResponseEntity<?> markRegistered(@PathVariable Long id, @PathVariable String slug) {
        if (userRepository.findById(id).isEmpty()) return ResponseEntity.notFound().build();
        if (!slug.matches("[a-z0-9-]{1,80}")) return ResponseEntity.badRequest().body(Map.of("error", "Unknown contest."));
        if (!registrationRepository.existsByUserIdAndContestSlug(id, slug)) {
            registrationRepository.save(ContestRegistration.builder().userId(id).contestSlug(slug).registeredAt(java.time.Instant.now()).build());
        }
        return ResponseEntity.ok(Map.of("registered", true));
    }

    @DeleteMapping("/{id}/contests/{slug}/registered")
    public ResponseEntity<?> unmarkRegistered(@PathVariable Long id, @PathVariable String slug) {
        registrationRepository.findByUserIdAndContestSlug(id, slug).ifPresent(registrationRepository::delete);
        return ResponseEntity.ok(Map.of("registered", false));
    }

    // 3. Retrieve a specific user by ID
    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        return userRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}