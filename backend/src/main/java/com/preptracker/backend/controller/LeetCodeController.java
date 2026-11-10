package com.preptracker.backend.controller;

import com.preptracker.backend.dto.LeetCodeResponseDto;
import com.preptracker.backend.dto.RecentSubmissionDto;
import com.preptracker.backend.dto.SolvedQuestionDto;
import com.preptracker.backend.model.LeetCodeLog;
import com.preptracker.backend.repository.LeetCodeLogRepository;
import com.preptracker.backend.service.LeetCodeInsightsService;
import com.preptracker.backend.service.LeetCodeService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/leetcode")
public class LeetCodeController {

    private final LeetCodeService leetCodeService;
    private final LeetCodeLogRepository leetCodeLogRepository;
    private final LeetCodeInsightsService insightsService;

    public LeetCodeController(LeetCodeService leetCodeService, LeetCodeLogRepository leetCodeLogRepository, LeetCodeInsightsService insightsService) {
        this.leetCodeService = leetCodeService;
        this.leetCodeLogRepository = leetCodeLogRepository;
        this.insightsService = insightsService;
    }

    // 1. Get raw stats from LeetCode API
    @GetMapping("/{username}")
    public LeetCodeResponseDto getStats(@PathVariable String username) {
        return leetCodeService.fetchLeetCodeStats(username);
    }

    // 2. Get recent submission list directly from LeetCode API
    @GetMapping("/{username}/recent")
    public RecentSubmissionDto getRecentSubmissions(@PathVariable String username) {
        return leetCodeService.fetchRecentSubmissions(username);
    }

    // Every accepted solve LeetCode exposes for this user (full history when LEETCODE_SESSION is theirs, else the last 20).
    @GetMapping("/{username}/history")
    public List<SolvedQuestionDto> getSubmissionHistory(@PathVariable String username) {
        return leetCodeService.fetchSolvedTimeline(username);
    }

    // Problems solved per topic tag (whole history)
    @GetMapping("/{username}/tags")
    public List<Map<String, Object>> getTagCounts(@PathVariable String username) {
        return insightsService.fetchTagCounts(username);
    }

    // Problem number + topic tags for each solved question; "pending" = still being fetched in the background
    @GetMapping("/{username}/questions")
    public Map<String, Object> getQuestionDetails(@PathVariable String username) {
        return insightsService.questionsFor(username);
    }

    // Contest rating summary and attended contests
    @GetMapping("/{username}/contests")
    public Map<String, Object> getContestHistory(@PathVariable String username) {
        return insightsService.contestHistory(username);
    }

    // Next weekly and biweekly contests
    @GetMapping("/contests/upcoming")
    public List<Map<String, Object>> getUpcomingContests() {
        return insightsService.upcomingContests();
    }

    // 3. Trigger live sync and save submissions to database
    @PostMapping("/{username}/sync")
    public List<LeetCodeLog> syncSubmissions(@PathVariable String username) {
        return leetCodeService.syncAndSaveSubmissions(username);
    }

    // 4. Retrieve saved submission logs from PostgreSQL (Matches Next.js fetch route)
    @GetMapping("/logs/{username}")
    public List<LeetCodeLog> getSavedLogs(@PathVariable String username) {
        return leetCodeLogRepository.findByUserLeetcodeUsernameIgnoreCase(username);
    }
}