package com.preptracker.backend.controller;

import com.preptracker.backend.model.ContestRegistration;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.ContestRegistrationRepository;
import com.preptracker.backend.repository.UserRepository;
import com.preptracker.backend.service.LeetCodeService;
import com.preptracker.backend.service.NotificationSchedulerService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@CrossOrigin(origins = "http://localhost:3000")
public class UserController {

    private final UserRepository userRepository;
    private final LeetCodeService leetCodeService;
    private final NotificationSchedulerService notificationSchedulerService;
    private final ContestRegistrationRepository registrationRepository;

    public UserController(UserRepository userRepository, LeetCodeService leetCodeService,
                          NotificationSchedulerService notificationSchedulerService,
                          ContestRegistrationRepository registrationRepository) {
        this.userRepository = userRepository;
        this.leetCodeService = leetCodeService;
        this.notificationSchedulerService = notificationSchedulerService;
        this.registrationRepository = registrationRepository;
    }

    // 1. Create or login existing user by email or username
    @PostMapping
    public ResponseEntity<User> createOrGetUser(@RequestBody User user) {
        // Try finding by email first, then by leetcodeUsername
        return userRepository.findFirstByEmail(user.getEmail())
                .or(() -> userRepository.findFirstByLeetcodeUsername(user.getLeetcodeUsername()))
                .map(existingUser -> {
                    existingUser.setLeetcodeUsername(user.getLeetcodeUsername());
                    if (user.getName() != null && !user.getName().isBlank()) {
                        existingUser.setName(user.getName());
                    }
                    if (user.getEmail() != null && !user.getEmail().isBlank()) {
                        existingUser.setEmail(user.getEmail());
                    }
                    return ResponseEntity.ok(userRepository.save(existingUser));
                })
                .orElseGet(() -> {
                    if (user.getTimezone() == null) {
                        user.setTimezone("UTC");
                    }
                    return new ResponseEntity<>(userRepository.save(user), HttpStatus.CREATED);
                });
    }

    // 2. Retrieve all registered users
    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

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

    public record NudgeRequest(String time, Boolean desktop) {}

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
                    return ResponseEntity.ok(userRepository.save(user));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // 7. Show the desktop car banner right now (preview)
    @PostMapping("/{id}/nudge/test")
    public ResponseEntity<?> testNudge(@PathVariable Long id) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(user -> {
                    boolean shown = notificationSchedulerService.showDesktopNudge(user);
                    return shown
                            ? ResponseEntity.ok(Map.of("shown", true))
                            : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("shown", false, "error", "The desktop car only works when the backend runs on your Windows PC."));
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