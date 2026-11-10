package com.preptracker.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Shows the desktop nudge: a pixel-art car towing a "COMPLETE LEETCODE" banner across the screen.
 * Runs a bundled PowerShell/WPF script, so it only works when the backend runs on the user's own Windows PC.
 */
@Service
public class DesktopNudgeService {

    private static final Logger log = LoggerFactory.getLogger(DesktopNudgeService.class);
    private static final String SCRIPT = "desktop/nudge-car.ps1";

    private final boolean supported = System.getProperty("os.name", "").toLowerCase().contains("win");

    public boolean isSupported() {
        return supported;
    }

    /** Starts the car animation and returns right away. Returns false if it could not be started. */
    public boolean show(String title, String subtitle) {
        if (!supported) return false;
        try {
            Path script = extractScript();
            Path logFile = script.resolveSibling("nudge-car.log");
            new ProcessBuilder(
                    "powershell.exe", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
                    "-File", script.toString(),
                    "-Title", sanitize(title),
                    "-Subtitle", sanitize(subtitle))
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(logFile.toFile()))
                    .start();
            return true;
        } catch (IOException e) {
            log.warn("Could not start the desktop nudge: {}", e.getMessage());
            return false;
        }
    }

    // The script lives inside the jar; PowerShell needs a real file, so copy it out (refreshed every time).
    private Path extractScript() throws IOException {
        Path dir = Path.of(System.getProperty("java.io.tmpdir"), "prepboard");
        Files.createDirectories(dir);
        Path target = dir.resolve("nudge-car.ps1");
        try (InputStream in = new ClassPathResource(SCRIPT).getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    // Keep to characters the pixel font draws, and nothing that could break the command line.
    private static String sanitize(String text) {
        if (text == null) return "";
        String cleaned = text.toUpperCase().replaceAll("[^A-Z0-9 \\-!.:/']", " ").replaceAll("\\s+", " ").trim();
        return cleaned.length() > 60 ? cleaned.substring(0, 60) : cleaned;
    }
}
