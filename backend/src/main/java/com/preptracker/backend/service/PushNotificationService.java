package com.preptracker.backend.service;

import com.preptracker.backend.model.PushSubscription;
import com.preptracker.backend.repository.PushSubscriptionRepository;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.util.List;

@Service
public class PushNotificationService {

    static {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    private final PushSubscriptionRepository pushSubscriptionRepository;
    private final PushService pushService;
    private final String vapidPublicKey;

    public PushNotificationService(
            PushSubscriptionRepository pushSubscriptionRepository,
            @Value("${push.vapid.public-key:}") String vapidPublicKey,
            @Value("${push.vapid.private-key:}") String vapidPrivateKey,
            @Value("${push.vapid.subject:mailto:hello@preptracker.app}") String vapidSubject
    ) {
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.vapidPublicKey = vapidPublicKey == null ? "" : vapidPublicKey.trim();

        if (this.vapidPublicKey.isBlank() || vapidPrivateKey == null || vapidPrivateKey.isBlank()) {
            // Push is optional: without keys the app still runs, it just can't send browser push.
            System.err.println("Web push is off: set VAPID_PRIVATE_KEY (see backend/application-local.properties.example).");
            this.pushService = null;
            return;
        }

        try {
            this.pushService = new PushService(
                    this.vapidPublicKey,
                    vapidPrivateKey.trim(),
                    vapidSubject
            );
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to initialize web-push service with the configured VAPID keys.",
                    e
            );
        }
    }

    public String getPublicKey() {
        return vapidPublicKey;
    }

    public void saveSubscription(String endpoint, String p256dh, String auth) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("subscription endpoint is required");
        }

        pushSubscriptionRepository.findByEndpoint(endpoint)
                .orElseGet(() -> pushSubscriptionRepository.save(
                        PushSubscription.builder()
                                .endpoint(endpoint)
                                .p256dh(p256dh)
                                .auth(auth)
                                .build()
                ));
    }

    public void sendToAll(String title, String body) {
    if (pushService == null) return;
    String payload = "{\"title\":\"" + escapeJson(title) + "\",\"body\":\"" + escapeJson(body) + "\"}";
    List<PushSubscription> subscriptions = pushSubscriptionRepository.findAll();

    for (PushSubscription subscription : subscriptions) {
        try {
            Notification notification = new Notification(
                    subscription.getEndpoint(),
                    subscription.getP256dh(),
                    subscription.getAuth(),
                    payload.getBytes(StandardCharsets.UTF_8)
            );

            var response = pushService.send(notification);

            System.out.println(
        "PUSH RESPONSE: "
                + response.getStatusLine().getStatusCode()
                + " "
                + response.getStatusLine().getReasonPhrase()
);

System.out.println(
        "PUSH RESPONSE BODY: "
                + (response.getEntity() != null
                    ? new String(
                        response.getEntity().getContent().readAllBytes(),
                        StandardCharsets.UTF_8
                    )
                    : "<empty>")
);

        } catch (Exception e) {
            System.err.println(
                    "Failed to send push to endpoint "
                            + subscription.getEndpoint()
                            + ": "
                            + e.getMessage()
            );
        }
    }
}

    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
