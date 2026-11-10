package com.preptracker.backend.dto;

import java.util.List;

public record RecentSubmissionDto(Data data) {
    public record Data(
            List<Submission> recentAcSubmissionList
    ) {}

    public record Submission(
            String id,
            String title,
            String titleSlug,
            String timestamp
    ) {}
}