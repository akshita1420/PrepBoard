package com.preptracker.backend.controller;

import com.preptracker.backend.AuthInterceptor;
import com.preptracker.backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Sign up, log in, log out. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    public record RegisterRequest(String name, String email, String leetcodeUsername, String password) {}
    public record LoginRequest(String email, String password) {}

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest r) {
        try {
            return ResponseEntity.ok(authService.register(r.name(), r.email(), r.leetcodeUsername(), r.password()));
        } catch (AuthService.AuthException e) {
            return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest r) {
        try {
            return ResponseEntity.ok(authService.login(r.email(), r.password()));
        } catch (AuthService.AuthException e) {
            return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        authService.logout(AuthInterceptor.bearerToken(request));
        return ResponseEntity.ok(Map.of("loggedOut", true));
    }
}
