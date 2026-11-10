package com.preptracker.backend.repository;

import com.preptracker.backend.model.QuestionMeta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface QuestionMetaRepository extends JpaRepository<QuestionMeta, String> {
}
