package com.credpay.userservice.dto;

import com.credpay.userservice.entity.Card;
import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * View model for listing a user's cards.
 * Exposes only the masked card number (never the full PAN).
 */
@Data
@AllArgsConstructor
public class CardResponse {

    private Long id;
    private String cardHolder;
    private String cardNumber;   // masked, e.g. "**** **** **** 5678"
    private String cardNetwork;

    public static CardResponse fromEntity(Card card) {
        return new CardResponse(
                card.getId(),
                card.getCardHolder(),
                card.getCardNumber(),
                card.getCardNetwork()
        );
    }
}
