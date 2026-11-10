package com.preptracker.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String leetcodeUsername;

    @Builder.Default
    @Column(nullable = false)
    private String timezone = "UTC";

    @Builder.Default
    private String notificationTime = "20:00";

    // Show the pixel car banner on this PC's desktop at notificationTime.
    private Boolean desktopNudge;

    // Set once the full LeetCode submission history has been imported; later syncs only fetch newer pages.
    @JsonIgnore
    private java.time.Instant historyImportedAt;

    // The user's own LeetCode login cookies, used to read their full submission history. Never sent back to the browser.
    @JsonIgnore
    @Column(length = 4096)
    private String leetcodeSession;

    @JsonIgnore
    @Column(length = 512)
    private String leetcodeCsrfToken;

    @com.fasterxml.jackson.annotation.JsonProperty(value = "leetcodeConnected", access = com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
    public boolean isLeetcodeConnected() {
        return leetcodeSession != null && !leetcodeSession.isBlank();
    }

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore // Prevents fetching full user graph recursively inside user responses
    private List<LeetCodeLog> logs = new ArrayList<>();
}