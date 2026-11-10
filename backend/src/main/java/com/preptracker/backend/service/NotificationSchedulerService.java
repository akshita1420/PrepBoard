package com.preptracker.backend.service;

import com.preptracker.backend.model.LeetCodeLog;
import com.preptracker.backend.model.User;
import com.preptracker.backend.repository.LeetCodeLogRepository;
import com.preptracker.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;

@Service
public class NotificationSchedulerService {

    /** Same daily target the dashboard shows. */
    public static final int DAILY_TARGET = 3;

    private final UserRepository userRepository;
    private final LeetCodeLogRepository leetCodeLogRepository;
    private final JavaMailSender mailSender;
    private final PushNotificationService pushNotificationService;
    private final DesktopNudgeService desktopNudgeService;

    @Autowired
    public NotificationSchedulerService(
            UserRepository userRepository,
            LeetCodeLogRepository leetCodeLogRepository,
            JavaMailSender mailSender,
            PushNotificationService pushNotificationService,
            DesktopNudgeService desktopNudgeService) {
        this.userRepository = userRepository;
        this.leetCodeLogRepository = leetCodeLogRepository;
        this.mailSender = mailSender;
        this.pushNotificationService = pushNotificationService;
        this.desktopNudgeService = desktopNudgeService;
    }

    public NotificationSchedulerService(
            UserRepository userRepository,
            LeetCodeLogRepository leetCodeLogRepository,
            JavaMailSender mailSender,
            PushNotificationService pushNotificationService) {
        this(userRepository, leetCodeLogRepository, mailSender, pushNotificationService, null);
    }

    public boolean shouldSendReminderAtTime(LocalTime currentTime, LocalTime targetTime) {
        return currentTime.equals(targetTime.truncatedTo(ChronoUnit.MINUTES));
    }

    /** Distinct questions this user solved today, in this computer's time zone. */
    public int solvedToday(User user) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        return (int) leetCodeLogRepository.findByUserLeetcodeUsernameIgnoreCase(user.getLeetcodeUsername()).stream()
                .filter(log -> {
                    if (log.getSolvedTimestamp() != null) {
                        return Instant.ofEpochSecond(log.getSolvedTimestamp()).atZone(zone).toLocalDate().equals(today);
                    }
                    return today.equals(log.getSolvedAt());
                })
                .map(LeetCodeLog::getTitleSlug)
                .filter(Objects::nonNull)
                .distinct()
                .count();
    }

    public String nudgeSubtitle(int remaining) {
        return remaining == 1
                ? "1 problem left today - keep the streak alive"
                : remaining + " problems left today - keep the streak alive";
    }

    /** Shows the pixel car banner now. Returns false when this machine can't show it. */
    public boolean showDesktopNudge(User user) {
        if (desktopNudgeService == null) return false;
        int remaining = Math.max(0, DAILY_TARGET - solvedToday(user));
        String subtitle = remaining == 0 ? "target hit today - nice work" : nudgeSubtitle(remaining);
        return desktopNudgeService.show("COMPLETE LEETCODE", subtitle);
    }

    /** Everyone gets this nudge, on top of their own time, if the day's target isn't met. */
    public static final LocalTime COMPULSORY_TIME = LocalTime.of(21, 0);

    // Runs every minute: nudges each user at their own time, and at 9 pm for everyone, if today's target isn't met.
    @Scheduled(cron = "0 * * * * *")
    public void checkAndSendReminders() {
        LocalTime now = LocalTime.now().truncatedTo(ChronoUnit.MINUTES);
        boolean compulsory = shouldSendReminderAtTime(now, COMPULSORY_TIME);
        List<User> users = userRepository.findAll();

        for (User user : users) {
            try {
                boolean ownTime = user.getNotificationTime() != null && !user.getNotificationTime().isBlank()
                        && shouldSendReminderAtTime(now, LocalTime.parse(user.getNotificationTime()));
                if (!ownTime && !compulsory) continue;

                int remaining = DAILY_TARGET - solvedToday(user);
                if (remaining <= 0) continue;

                if (Boolean.TRUE.equals(user.getDesktopNudge()) && desktopNudgeService != null) {
                    desktopNudgeService.show("COMPLETE LEETCODE", (compulsory && !ownTime ? "9 PM CHECK - " : "") + nudgeSubtitle(remaining));
                }

                sendEmail(
                        user.getEmail(),
                        "PrepTracker: Daily prep nudge",
                        "Hey " + user.getName() + ",\n\nYour daily prep reminder is here. You still have " + remaining
                                + " LeetCode problem(s) left today. Open your dashboard and keep the streak alive."
                );

                if (pushNotificationService != null) {
                    pushNotificationService.sendToAll("Daily prep nudge", "Complete LeetCode: " + nudgeSubtitle(remaining) + ".");
                }
            } catch (Exception e) {
                System.err.println("Error processing notification time for user " + user.getEmail() + ": " + e.getMessage());
            }
        }
    }

    private void sendEmail(String toEmail, String subject, String body) {
        if (mailSender == null) return;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            System.out.println("Email notification sent successfully to " + toEmail);
        } catch (Exception e) {
            System.err.println("Failed to send email to " + toEmail + ": " + e.getMessage());
        }
    }
}
