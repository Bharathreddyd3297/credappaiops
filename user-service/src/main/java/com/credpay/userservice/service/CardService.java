package com.credpay.userservice.service;

import com.credpay.userservice.dto.AddCardRequest;
import com.credpay.userservice.dto.CardResponse;
import com.credpay.userservice.entity.Card;
import com.credpay.userservice.exception.InvalidCardException;
import com.credpay.userservice.repository.CardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CardService {

    private final CardRepository cardRepository;

    /**
     * Adds a card for the signed-in user. Only the masked card number is stored.
     *
     * @throws InvalidCardException if the number fails the Luhn check or the card has expired
     */
    @Transactional
    public void addCard(Long userId, AddCardRequest request) {
        // 1. The number must pass the Luhn checksum (catches typos)
        if (!passesLuhnCheck(request.getCardNumber())) {
            throw new InvalidCardException("cardNumber is not a valid card number");
        }

        // 2. The card must not have expired (valid through the end of its expiry month)
        YearMonth expiry = YearMonth.of(request.getExpiryYear(), request.getExpiryMonth());
        if (expiry.isBefore(YearMonth.now())) {
            throw new InvalidCardException("The card has expired");
        }

        // 3. Store ONLY the masked card number
        Card card = Card.builder()
                .userId(userId)
                .cardHolder(request.getCardHolder())
                .cardNumber(maskCardNumber(request.getCardNumber()))
                .cardNetwork(request.getCardNetwork())
                .expiryMonth(request.getExpiryMonth().shortValue())
                .expiryYear(request.getExpiryYear().shortValue())
                .build();

        cardRepository.save(card);
    }

    /** Lists all cards belonging to a user (masked). */
    @Transactional(readOnly = true)
    public List<CardResponse> getCardsByUser(Long userId) {
        return cardRepository.findByUserId(userId).stream()
                .map(CardResponse::fromEntity)
                .toList();
    }

    /**
     * Masks all but the last four digits, e.g.
     * "1234567812345678" -> "**** **** **** 5678".
     */
    private String maskCardNumber(String cardNumber) {
        String lastFour = cardNumber.substring(cardNumber.length() - 4);
        return "**** **** **** " + lastFour;
    }

    /** Luhn (mod 10) checksum used by all card networks. */
    static boolean passesLuhnCheck(String digits) {
        int sum = 0;
        boolean doubleIt = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int digit = digits.charAt(i) - '0';
            if (doubleIt) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            doubleIt = !doubleIt;
        }
        return sum % 10 == 0;
    }
}
