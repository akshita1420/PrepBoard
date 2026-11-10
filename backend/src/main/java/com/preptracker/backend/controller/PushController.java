package com.preptracker.backend.controller;

import com.preptracker.backend.AuthInterceptor;
import com.preptracker.backend.service.PushNotificationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/push")
public class PushController {

    private final PushNotificationService pushNotificationService;

    public PushController(PushNotificationService pushNotificationService) {
        this.pushNotificationService = pushNotificationService;
    }

    @GetMapping("/public-key")
    public ResponseEntity<Map<String, String>> getPublicKey() {
        return ResponseEntity.ok(Map.of("publicKey", pushNotificationService.getPublicKey()));
    }

    // Saves this browser's push subscription for the signed-in user only.
    @PostMapping("/subscribe")
    public ResponseEntity<Void> subscribe(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        pushNotificationService.saveSubscription(
                AuthInterceptor.currentUser(request).getId(),
                payload.get("endpoint"), payload.get("p256dh"), payload.get("auth"));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/send-test")
    public ResponseEntity<Map<String, String>> sendTest(HttpServletRequest request) {
        pushNotificationService.sendToUser(AuthInterceptor.currentUser(request).getId(), "prepboard", "Test notification from the backend.");
        return ResponseEntity.ok(Map.of("status", "queued"));
    }
}
