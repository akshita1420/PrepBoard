package com.preptracker.backend.repository;

import com.preptracker.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findFirstByEmail(String email);

    Optional<User> findFirstByLeetcodeUsername(String leetcodeUsername);

    List<User> findByLeetcodeUsernameIgnoreCase(String leetcodeUsername);
}