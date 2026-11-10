package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** A signed-in browser. The token lives in the browser; only its SHA-256 is stored here. */
@Entity
@Table(name = "auth_sessions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    @Column(unique = true, length = 64)
    private String tokenHash;

    private Instant createdAt;
    private Instant expiresAt;
}
