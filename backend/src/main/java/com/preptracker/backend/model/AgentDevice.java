package com.preptracker.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** A laptop running the prepboard desktop helper, linked to one user. */
@Entity
@Table(name = "agent_devices")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String name;

    // SHA-256 of the helper's secret token; the token itself is only stored on the laptop.
    @Column(unique = true, length = 64)
    private String tokenHash;

    private Instant linkedAt;
    private Instant lastSeenAt;

    // Recently shown nudge keys (e.g. "2026-11-10T19:30"), so each nudge shows once per device.
    @Column(length = 1024)
    private String shownKeys;

    // Set by the dashboard's "preview" button; the helper shows the car on its next check.
    private Instant previewRequestedAt;
}
