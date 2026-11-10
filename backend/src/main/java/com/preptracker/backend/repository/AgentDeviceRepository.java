package com.preptracker.backend.repository;

import com.preptracker.backend.model.AgentDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AgentDeviceRepository extends JpaRepository<AgentDevice, Long> {

    Optional<AgentDevice> findByTokenHash(String tokenHash);

    List<AgentDevice> findByUserId(Long userId);

    boolean existsByUserId(Long userId);
}
