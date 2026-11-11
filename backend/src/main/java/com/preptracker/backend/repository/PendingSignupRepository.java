package com.preptracker.backend.repository;

import com.preptracker.backend.model.PendingSignup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PendingSignupRepository extends JpaRepository<PendingSignup, String> {
}
