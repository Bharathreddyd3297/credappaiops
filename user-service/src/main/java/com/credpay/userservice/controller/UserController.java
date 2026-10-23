package com.credpay.userservice.controller;

import com.credpay.userservice.dto.MessageResponse;
import com.credpay.userservice.dto.UserProfileResponse;
import com.credpay.userservice.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registration and login happen in Keycloak; this controller only serves
 * the signed-in customer's profile.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // Used by the pipeline's post-deployment smoke test (GET /api/users/health).
    @GetMapping("/health")
    public ResponseEntity<MessageResponse> health() {
        return ResponseEntity.ok(new MessageResponse("UP"));
    }

    @GetMapping("/me")
    public UserProfileResponse me(@AuthenticationPrincipal Jwt token) {
        return UserProfileResponse.fromEntity(userService.currentUser(token));
    }
}
