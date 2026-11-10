package com.preptracker.backend;

import com.preptracker.backend.model.User;
import com.preptracker.backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Every API call needs a signed-in user, and may only touch that user's own data:
 * /api/v1/users/{id}/... must be their id, /api/leetcode/{username}/... must be their LeetCode username.
 * Sign-in, the desktop helper (own token) and a few public endpoints are excluded in {@link WebConfig}.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String USER_ATTRIBUTE = "prepboard.user";

    private static final Pattern USER_PATH = Pattern.compile("^/api/v1/users/(\\d+)(/.*)?$");
    private static final Pattern LOGS_PATH = Pattern.compile("^/api/leetcode/logs/([^/]+)$");
    private static final Pattern LEETCODE_PATH = Pattern.compile("^/api/leetcode/([^/]+)(/.*)?$");

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    public static String bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
    }

    /** The signed-in user for this request (set by the interceptor). */
    public static User currentUser(HttpServletRequest request) {
        return (User) request.getAttribute(USER_ATTRIBUTE);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true; // CORS preflight

        Optional<User> user = authService.userFor(bearerToken(request));
        if (user.isEmpty()) return deny(response, 401, "Please log in.");
        request.setAttribute(USER_ATTRIBUTE, user.get());

        String path = request.getRequestURI();
        Matcher m = USER_PATH.matcher(path);
        if (m.matches() && !m.group(1).equals(String.valueOf(user.get().getId()))) {
            return deny(response, 403, "That's not your account.");
        }
        m = LOGS_PATH.matcher(path);
        if (!m.matches()) m = LEETCODE_PATH.matcher(path);
        if (m.matches() && !m.group(1).equalsIgnoreCase(user.get().getLeetcodeUsername())) {
            return deny(response, 403, "That's not your LeetCode account.");
        }
        return true;
    }

    private static boolean deny(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message.replace("\"", "'") + "\"}");
        return false;
    }
}
