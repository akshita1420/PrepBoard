package com.preptracker.backend.service;

import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Syncs every user's LeetCode solves once an hour. Without a LeetCode login only the latest
 * 20 solves are visible, so syncing often is what keeps the calendar's history complete.
 */
@Service
public class LeetCodeSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(LeetCodeSyncScheduler.class);

    private final UserRepository userRepository;
    private final LeetCodeService leetCodeService;

    public LeetCodeSyncScheduler(UserRepository userRepository, LeetCodeService leetCodeService) {
        this.userRepository = userRepository;
        this.leetCodeService = leetCodeService;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void syncAllUsers() {
        for (User user : userRepository.findAll()) {
            try {
                leetCodeService.syncAndSaveSubmissions(user.getLeetcodeUsername());
            } catch (Exception e) {
                log.warn("Hourly LeetCode sync failed for {}: {}", user.getLeetcodeUsername(), e.getMessage());
            }
        }
    }
}
