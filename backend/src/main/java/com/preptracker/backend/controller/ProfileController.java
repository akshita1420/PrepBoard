package com.preptracker.backend.controller;

import com.preptracker.backend.service.ProfileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Coding profiles on other sites, per user (the auth check only lets users reach their own id). */
@RestController
@RequestMapping("/api/v1/users/{id}/profiles")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    public record ConnectRequest(String platform, String handle) {}

    @GetMapping
    public ResponseEntity<?> list(@PathVariable Long id, @RequestParam(defaultValue = "false") boolean refresh) {
        return ResponseEntity.ok(Map.of("platforms", ProfileService.PLATFORMS, "profiles", profileService.profilesFor(id, refresh)));
    }

    // "Is this you?" preview before connecting.
    @GetMapping("/lookup")
    public ResponseEntity<?> lookup(@PathVariable Long id, @RequestParam String platform, @RequestParam String handle) {
        try {
            return ResponseEntity.ok(profileService.lookup(platform, handle));
        } catch (ProfileService.ProfileException e) {
            return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> connect(@PathVariable Long id, @RequestBody ConnectRequest request) {
        try {
            return ResponseEntity.ok(profileService.connect(id, request.platform(), request.handle()));
        } catch (ProfileService.ProfileException e) {
            return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{platform}")
    public ResponseEntity<?> disconnect(@PathVariable Long id, @PathVariable String platform) {
        profileService.disconnect(id, platform);
        return ResponseEntity.ok(Map.of("disconnected", platform));
    }
}
