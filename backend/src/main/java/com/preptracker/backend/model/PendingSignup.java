package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** A sign-up waiting for its email code. The account is only created once the code is confirmed. */
@Entity
@Table(name = "pending_signups")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PendingSignup {

    @Id
    private String email;

    private String name;
    private String leetcodeUsername;
    private String passwordHash;

    // SHA-256 of the 6-digit code that was emailed.
    @Column(length = 64)
    private String codeHash;

    private Instant expiresAt;
    private Instant sentAt;
    private int attempts;
}
