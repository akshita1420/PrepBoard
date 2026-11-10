package com.preptracker.backend.repository;

import com.preptracker.backend.model.LeetCodeLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface LeetCodeLogRepository extends JpaRepository<LeetCodeLog, Long> {

    List<LeetCodeLog> findByUserLeetcodeUsername(String username);

    // LeetCode usernames are case-insensitive, and accounts may have been saved with different casing.
    List<LeetCodeLog> findByUserLeetcodeUsernameIgnoreCase(String username);

    boolean existsByUserIdAndTitleSlugAndSolvedAt(Long userId, String titleSlug, LocalDate solvedAt);

    List<LeetCodeLog> findByUserId(Long userId);
}