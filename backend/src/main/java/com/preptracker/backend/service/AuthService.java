package com.preptracker.backend.service;

import com.preptracker.backend.model.AuthSession;
import com.preptracker.backend.model.PendingSignup;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.AuthSessionRepository;
import com.preptracker.backend.repository.PendingSignupRepository;
import com.preptracker.backend.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/** Email + password accounts with long-lived browser sessions. */
@Service
public class AuthService {

    private static final Duration SESSION_LIFETIME = Duration.ofDays(30);

    private final UserRepository userRepository;
    private final AuthSessionRepository sessionRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserRepository userRepository, AuthSessionRepository sessionRepository) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
    }

    /** Thrown for anything the user should see as a message (wrong password, email taken, …). */
    public static class AuthException extends RuntimeException {
        public final int status;

        public AuthException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static final Duration CODE_LIFETIME = Duration.ofMinutes(10);
    private static final Duration RESEND_GAP = Duration.ofSeconds(30);
    private static final int MAX_CODE_ATTEMPTS = 5;

    private PendingSignupRepository pendingRepository;
    private EmailService emailService;

    @org.springframework.beans.factory.annotation.Autowired
    void setSignupDependencies(PendingSignupRepository pendingRepository, EmailService emailService) {
        this.pendingRepository = pendingRepository;
        this.emailService = emailService;
    }

    /**
     * Step 1 of sign-up: checks the details and emails a 6-digit code. Nothing is created until the code
     * is confirmed, so nobody can make an account with an email address they don't own.
     */
    public Map<String, Object> register(String name, String email, String leetcodeUsername, String password) {
        String mail = normalizeEmail(email);
        String leetcode = leetcodeUsername == null ? "" : leetcodeUsername.trim();
        if (mail.isEmpty() || !mail.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw new AuthException(400, "Enter a valid email.");
        if (leetcode.isEmpty()) throw new AuthException(400, "Enter your LeetCode username.");
        checkPassword(password);
        checkAvailable(mail, leetcode);

        PendingSignup pending = pendingRepository.findById(mail).orElse(null);
        if (pending != null && pending.getSentAt() != null && pending.getSentAt().plus(RESEND_GAP).isAfter(Instant.now())) {
            throw new AuthException(429, "A code was just sent. Wait 30 seconds before asking for another.");
        }

        String code = String.format("%06d", random.nextInt(1_000_000));
        pendingRepository.save(PendingSignup.builder()
                .email(mail)
                .name(name == null || name.isBlank() ? leetcode : name.trim())
                .leetcodeUsername(leetcode)
                .passwordHash(encoder.encode(password))
                .codeHash(sha256(mail + ":" + code))
                .sentAt(Instant.now())
                .expiresAt(Instant.now().plus(CODE_LIFETIME))
                .attempts(0)
                .build());
        try {
            emailService.sendSignupCode(mail, code);
        } catch (Exception e) {
            pendingRepository.deleteById(mail); // let them retry straight away
            throw new AuthException(502, "Couldn't send the email. Check the address and try again.");
        }
        return Map.of("pending", true, "email", mail);
    }

    /** Step 2 of sign-up: the emailed code creates the account (or claims an old password-less one). */
    public Map<String, Object> verify(String email, String code) {
        String mail = normalizeEmail(email);
        PendingSignup pending = pendingRepository.findById(mail)
                .orElseThrow(() -> new AuthException(400, "No sign-up in progress for this email. Start again."));
        if (pending.getExpiresAt().isBefore(Instant.now())) {
            pendingRepository.delete(pending);
            throw new AuthException(400, "That code expired. Sign up again to get a new one.");
        }
        if (pending.getAttempts() >= MAX_CODE_ATTEMPTS) {
            pendingRepository.delete(pending);
            throw new AuthException(429, "Too many wrong codes. Sign up again to get a new one.");
        }
        String entered = code == null ? "" : code.replaceAll("\\s", "");
        if (!MessageDigest.isEqual(sha256(mail + ":" + entered).getBytes(StandardCharsets.UTF_8),
                pending.getCodeHash().getBytes(StandardCharsets.UTF_8))) {
            pending.setAttempts(pending.getAttempts() + 1);
            pendingRepository.save(pending);
            throw new AuthException(400, "Wrong code. " + (MAX_CODE_ATTEMPTS - pending.getAttempts()) + " tries left.");
        }

        // Re-check: someone may have taken the email or LeetCode username in the meantime.
        checkAvailable(mail, pending.getLeetcodeUsername());
        User user = userRepository.findFirstByEmail(mail).orElseGet(User::new);
        user.setEmail(mail);
        user.setName(pending.getName());
        user.setLeetcodeUsername(pending.getLeetcodeUsername());
        if (user.getTimezone() == null) user.setTimezone("UTC");
        user.setPasswordHash(pending.getPasswordHash());
        user = userRepository.save(user);
        pendingRepository.delete(pending);
        return newSession(user);
    }

    private void checkAvailable(String mail, String leetcode) {
        Optional<User> existing = userRepository.findFirstByEmail(mail);
        if (existing.isPresent() && existing.get().getPasswordHash() != null) {
            throw new AuthException(409, "An account with this email already exists. Log in instead.");
        }
        // One LeetCode account belongs to one prepboard account, so nobody can open someone else's history.
        boolean leetcodeTaken = userRepository.findByLeetcodeUsernameIgnoreCase(leetcode).stream()
                .anyMatch(u -> u.getPasswordHash() != null && !u.getEmail().equalsIgnoreCase(mail));
        if (leetcodeTaken) throw new AuthException(409, "That LeetCode username is already used by another account.");
    }

    public Map<String, Object> login(String email, String password) {
        User user = userRepository.findFirstByEmail(normalizeEmail(email))
                .orElseThrow(() -> new AuthException(401, "Wrong email or password."));
        if (user.getPasswordHash() == null) {
            throw new AuthException(401, "This account has no password yet. Use \"sign up\" with the same email to set one.");
        }
        if (password == null || !encoder.matches(password, user.getPasswordHash())) {
            throw new AuthException(401, "Wrong email or password.");
        }
        return newSession(user);
    }

    /** The signed-in user for a browser token, or empty if it's missing, unknown or expired. */
    public Optional<User> userFor(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return sessionRepository.findByTokenHash(sha256(token))
                .filter(s -> s.getExpiresAt().isAfter(Instant.now()))
                .flatMap(s -> userRepository.findById(s.getUserId()));
    }

    public void logout(String token) {
        if (token == null) return;
        sessionRepository.findByTokenHash(sha256(token)).ifPresent(sessionRepository::delete);
    }

    private Map<String, Object> newSession(User user) {
        byte[] secret = new byte[32];
        random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        sessionRepository.save(AuthSession.builder()
                .userId(user.getId())
                .tokenHash(sha256(token))
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(SESSION_LIFETIME))
                .build());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("user", user);
        return out;
    }

    private static void checkPassword(String password) {
        if (password == null || password.length() < 8) throw new AuthException(400, "Use a password of at least 8 characters.");
        if (password.length() > 72) throw new AuthException(400, "Use a password of at most 72 characters.");
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
