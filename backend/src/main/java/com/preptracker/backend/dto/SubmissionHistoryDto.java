package com.preptracker.backend.dto;

import java.util.List;

public record SubmissionHistoryDto(Data data) {
    public record Data(SubmissionList submissionList) {}

    public record SubmissionList(
            String lastKey,
            boolean hasNext,
            List<Submission> submissions
    ) {}

    public record Submission(
            String id,
            String title,
            String titleSlug,
            String timestamp,
            String statusDisplay
    ) {}
}
