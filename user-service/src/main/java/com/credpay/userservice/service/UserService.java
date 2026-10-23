package com.credpay.userservice.service;

import com.credpay.userservice.entity.User;
import com.credpay.userservice.exception.AccountConflictException;
import com.credpay.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final int FULL_NAME_MAX_LENGTH = 100;

    private final UserRepository userRepository;

    /**
     * Returns the CredPay user behind an access token, creating it on the
     * account's first login ("just-in-time provisioning").
     *
     * A user that existed before Keycloak is linked by email, but only when
     * Keycloak has verified that email - otherwise anyone could register the
     * same address in Keycloak and take over the account.
     *
     * @throws AccountConflictException if the email belongs to another account
     */
    @Transactional
    public User currentUser(Jwt token) {
        return userRepository.findByKeycloakId(token.getSubject())
                .orElseGet(() -> provision(token));
    }

    private User provision(Jwt token) {
        String email = token.getClaimAsString("email");
        if (email == null || email.isBlank()) {
            throw new AccountConflictException("The login token has no email address");
        }

        Optional<User> existing = userRepository.findByEmailIgnoreCase(email);
        if (existing.isPresent()) {
            User user = existing.get();
            if (user.getKeycloakId() != null) {
                throw new AccountConflictException("This email is already linked to another account");
            }
            if (!Boolean.TRUE.equals(token.getClaimAsBoolean("email_verified"))) {
                throw new AccountConflictException("Verify your email address to access your existing account");
            }
            user.setKeycloakId(token.getSubject());
            return user;
        }

        return userRepository.save(User.builder()
                .keycloakId(token.getSubject())
                .email(email)
                .fullName(fullName(token, email))
                .build());
    }

    private static String fullName(Jwt token, String email) {
        String name = token.getClaimAsString("name");
        if (name == null || name.isBlank()) {
            String given = Optional.ofNullable(token.getClaimAsString("given_name")).orElse("");
            String family = Optional.ofNullable(token.getClaimAsString("family_name")).orElse("");
            name = (given + " " + family).trim();
        }
        if (name.isBlank()) {
            name = email;
        }
        return name.length() > FULL_NAME_MAX_LENGTH ? name.substring(0, FULL_NAME_MAX_LENGTH) : name;
    }
}
