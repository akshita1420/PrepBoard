package com.preptracker.backend.dto;

/**
 * One accepted solve of a question, as shown on the study calendar.
 *
 * @param timestamp epoch seconds of the accepted submission
 */
public record SolvedQuestionDto(
        String title,
        String titleSlug,
        String difficulty,
        long timestamp
) {
    public SolvedQuestionDto withDifficulty(String newDifficulty) {
        return new SolvedQuestionDto(title, titleSlug, newDifficulty, timestamp);
    }
}
