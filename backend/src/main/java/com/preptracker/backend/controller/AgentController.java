package com.preptracker.backend.controller;

import com.preptracker.backend.service.AgentService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.util.Map;

/** Endpoints used by the desktop helper on users' laptops. */
@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    public record LinkRequest(String code, String deviceName) {}

    // One-time: the installer trades the code from the dashboard for the helper's secret token.
    @PostMapping("/link")
    public ResponseEntity<?> link(@RequestBody LinkRequest request) {
        try {
            return ResponseEntity.ok(agentService.link(request.code(), request.deviceName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // Every minute: "should I show the car now?"
    @GetMapping("/poll")
    public ResponseEntity<?> poll(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        String token = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
        try {
            return ResponseEntity.ok(agentService.poll(token));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", e.getMessage()));
        }
    }

    // Linux: curl -fsSL https://<server>/api/agent/install.sh | bash
    @GetMapping(value = "/install.sh", produces = "text/x-shellscript")
    public ResponseEntity<String> linuxInstaller() throws IOException {
        String server = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/x-shellscript; charset=utf-8"))
                .body(agentService.buildLinuxInstaller(server));
    }

    // The helper installer, with this server's public address baked in.
    @GetMapping("/download")
    public ResponseEntity<byte[]> download() throws IOException {
        String server = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        byte[] zip = agentService.buildInstallerZip(server);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"prepboard-helper.zip\"")
                .body(zip);
    }
}
