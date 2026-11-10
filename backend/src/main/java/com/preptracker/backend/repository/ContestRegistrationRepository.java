package com.preptracker.backend.repository;

import com.preptracker.backend.model.ContestRegistration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContestRegistrationRepository extends JpaRepository<ContestRegistration, Long> {

    List<ContestRegistration> findByUserId(Long userId);

    Optional<ContestRegistration> findByUserIdAndContestSlug(Long userId, String contestSlug);

    boolean existsByUserIdAndContestSlug(Long userId, String contestSlug);
}
