package com.preptracker.backend.dto;

import java.util.List;

public record LeetCodeResponseDto(Data data) {
    public record Data(
            MatchedUser matchedUser
    ) {}

    public record MatchedUser(
            String username,
            SubmitStats submitStats,
            UserCalendar userCalendar
    ) {}

    public record SubmitStats(
            List<AcSubmissionNum> acSubmissionNum
    ) {}

    public record AcSubmissionNum(
            String difficulty,
            int count
    ) {}

    public record UserCalendar(
            int streak,
            String submissionCalendar
    ) {}
}