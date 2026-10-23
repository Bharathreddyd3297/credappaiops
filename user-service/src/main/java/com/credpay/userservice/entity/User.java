package com.credpay.userservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * A CredPay customer. Credentials live in Keycloak; this row holds the
 * profile and links to the Keycloak account through keycloak_id.
 * Columns: id, full_name, email, keycloak_id, created_at
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "email", nullable = false, unique = true, length = 150)
    private String email;

    // The Keycloak account id (the access token's "sub" claim)
    @Column(name = "keycloak_id", unique = true, length = 64)
    private String keycloakId;

    // Populated by the database DEFAULT NOW(); read-only from the app side.
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
