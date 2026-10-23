package com.credpay.userservice.controller;

import com.credpay.userservice.dto.AddCardRequest;
import com.credpay.userservice.dto.CardResponse;
import com.credpay.userservice.dto.MessageResponse;
import com.credpay.userservice.service.CardService;
import com.credpay.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Cards of the signed-in customer. The owner always comes from the access
 * token, never from the request, so one customer cannot read or add cards
 * for another.
 */
@RestController
@RequestMapping("/api/cards")
@RequiredArgsConstructor
public class CardController {

    private final CardService cardService;
    private final UserService userService;

    @PostMapping
    public ResponseEntity<MessageResponse> addCard(@AuthenticationPrincipal Jwt token,
                                                   @Valid @RequestBody AddCardRequest request) {
        cardService.addCard(userService.currentUser(token).getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new MessageResponse("Card added successfully"));
    }

    @GetMapping
    public List<CardResponse> myCards(@AuthenticationPrincipal Jwt token) {
        return cardService.getCardsByUser(userService.currentUser(token).getId());
    }
}
