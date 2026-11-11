package com.preptracker.backend.repository;

import com.preptracker.backend.model.ProfileLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProfileLinkRepository extends JpaRepository<ProfileLink, Long> {

    List<ProfileLink> findByUserId(Long userId);

    Optional<ProfileLink> findByUserIdAndPlatform(Long userId, String platform);
}
