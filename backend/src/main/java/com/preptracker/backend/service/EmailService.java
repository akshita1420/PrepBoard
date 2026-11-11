package com.preptracker.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Sends account emails (sign-up codes). Without mail settings, codes go to the server log instead. */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final String from;

    private final boolean configured;

    public EmailService(JavaMailSender mailSender,
                        @Value("${spring.mail.username:}") String from,
                        @Value("${spring.mail.password:}") String password) {
        this.mailSender = mailSender;
        this.from = from == null ? "" : from.trim();
        // A placeholder like "YOUR_NEW_GMAIL_APP_PASSWORD" counts as not set up.
        String pw = password == null ? "" : password.trim();
        this.configured = !this.from.isBlank() && !pw.isBlank() && !pw.toUpperCase().startsWith("YOUR_");
        if (!configured) log.warn("Email is not set up: sign-up codes will be written to this log instead of emailed.");
    }

    public boolean isConfigured() {
        return configured;
    }

    /** Emails a sign-up code. Throws if mail is configured but sending fails. */
    public void sendSignupCode(String to, String code) {
        if (!isConfigured()) {
            log.warn("Email is not configured (MAIL_USERNAME/MAIL_PASSWORD). Sign-up code for {}: {}", to, code);
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom("prepboard <" + from + ">");
        message.setTo(to);
        message.setSubject(code + " is your prepboard code");
        message.setText("""
                Your prepboard sign-up code is:

                    %s

                It works for 10 minutes. If you didn't try to sign up, you can ignore this email.
                """.formatted(code));
        mailSender.send(message);
    }
}
