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
 * Maps to the existing 'cards' table created by schema.sql.
 * Columns: id, user_id, card_holder, card_number, card_network,
 *          expiry_month, expiry_year, created_at
 *
 * Only the MASKED card number is ever stored (e.g. "**** **** **** 5678").
 */
@Entity
@Table(name = "cards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Card {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "card_holder", nullable = false, length = 100)
    private String cardHolder;

    // Stored MASKED only - never the full PAN.
    @Column(name = "card_number", nullable = false, length = 25)
    private String cardNumber;

    @Column(name = "card_network", length = 20)
    private String cardNetwork;

    // SMALLINT in PostgreSQL -> Short in Java (keeps ddl-auto=validate happy).
    @Column(name = "expiry_month", nullable = false)
    private Short expiryMonth;

    @Column(name = "expiry_year", nullable = false)
    private Short expiryYear;

    // Populated by the database DEFAULT NOW(); read-only from the app side.
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
