package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** A user telling prepboard "yes, I registered" for a LeetCode contest. */
@Entity
@Table(name = "contest_registrations", uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "contestSlug"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContestRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String contestSlug;
    private Instant registeredAt;
}
