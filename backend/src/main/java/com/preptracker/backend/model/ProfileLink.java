package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** A coding-site profile (Codeforces, GeeksforGeeks, …) a user connected, with its last fetched stats. */
@Entity
@Table(name = "profile_links", uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "platform"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProfileLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String platform;
    private String handle;

    // Last stats as JSON (see ProfileService.Stats), so the page loads without asking every site each time.
    @Column(columnDefinition = "text")
    private String statsJson;

    private Instant fetchedAt;
    private Instant connectedAt;
}
