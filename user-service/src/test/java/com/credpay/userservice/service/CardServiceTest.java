package com.credpay.userservice.service;

import com.credpay.userservice.dto.AddCardRequest;
import com.credpay.userservice.entity.Card;
import com.credpay.userservice.exception.InvalidCardException;
import com.credpay.userservice.repository.CardRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;

class CardServiceTest {

    private final CardRepository cardRepository = mock(CardRepository.class);
    private final CardService cardService = new CardService(cardRepository);

    @Test
    void luhnCheckAcceptsValidAndRejectsTypos() {
        assertThat(CardService.passesLuhnCheck("4111111111111111")).isTrue();
        assertThat(CardService.passesLuhnCheck("5555555555554444")).isTrue();
        assertThat(CardService.passesLuhnCheck("4111111111111112")).isFalse();
    }

    @Test
    void storesOnlyTheMaskedNumber() {
        cardService.addCard(7L, request("4111111111111111", YearMonth.now().plusYears(1)));

        ArgumentCaptor<Card> saved = ArgumentCaptor.forClass(Card.class);
        verify(cardRepository).save(saved.capture());
        assertThat(saved.getValue().getCardNumber()).isEqualTo("**** **** **** 1111");
        assertThat(saved.getValue().getUserId()).isEqualTo(7L);
    }

    @Test
    void acceptsCardExpiringThisMonth() {
        cardService.addCard(7L, request("4111111111111111", YearMonth.now()));
        verify(cardRepository).save(any());
    }

    @Test
    void rejectsExpiredCard() {
        assertThatThrownBy(() -> cardService.addCard(7L, request("4111111111111111", YearMonth.now().minusMonths(1))))
                .isInstanceOf(InvalidCardException.class);
        verify(cardRepository, never()).save(any());
    }

    private static AddCardRequest request(String number, YearMonth expiry) {
        AddCardRequest request = new AddCardRequest();
        request.setCardHolder("Demo");
        request.setCardNumber(number);
        request.setCardNetwork("VISA");
        request.setExpiryMonth(expiry.getMonthValue());
        request.setExpiryYear(expiry.getYear());
        return request;
    }
}
