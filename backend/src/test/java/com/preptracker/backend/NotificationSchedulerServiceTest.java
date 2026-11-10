package com.preptracker.backend;

import com.preptracker.backend.service.NotificationSchedulerService;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NotificationSchedulerServiceTest {

    @Test
    void shouldSendReminderWhenCurrentTimeMatchesConfiguredNotificationTime() {
        NotificationSchedulerService service = new NotificationSchedulerService(null, null, null, null);

        assertTrue(service.shouldSendReminderAtTime(LocalTime.of(10, 21), LocalTime.of(10, 21)));
        assertFalse(service.shouldSendReminderAtTime(LocalTime.of(10, 20), LocalTime.of(10, 21)));
    }
}
