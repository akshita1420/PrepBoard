package com.preptracker.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "leetcode_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeetCodeLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String problemTitle;
    private String titleSlug;
    private String difficulty;
    private String problemUrl;
    private LocalDate solvedAt;

    // Epoch seconds of the accepted submission, so the UI can place it in the viewer's time zone.
    private Long solvedTimestamp;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore // Prevents circular JSON dependency issues during fetch
    private User user;
}