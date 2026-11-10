package com.preptracker.backend.controller;

import com.preptracker.backend.service.PushNotificationService;
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

    @PostMapping("/subscribe")
    public ResponseEntity<Void> subscribe(@RequestBody Map<String, String> payload) {
        String endpoint = payload.get("endpoint");
        String p256dh = payload.get("p256dh");
        String auth = payload.get("auth");

        pushNotificationService.saveSubscription(endpoint, p256dh, auth);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/send-test")
    public ResponseEntity<Map<String, String>> sendTest() {
        pushNotificationService.sendToAll("PrepTracker", "Test notification from the backend.");
        return ResponseEntity.ok(Map.of("status", "queued"));
    }
}
