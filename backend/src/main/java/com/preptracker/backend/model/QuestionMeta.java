package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** Public LeetCode facts about a question (number, difficulty, topic tags), shared by all users. */
@Entity
@Table(name = "question_meta")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QuestionMeta {

    @Id
    private String titleSlug;

    private String frontendId;
    private String title;
    private String difficulty;

    // Comma-separated topic tag names, e.g. "Array,Hash Table".
    @Column(length = 1024)
    private String tags;

    private Instant fetchedAt;
}
