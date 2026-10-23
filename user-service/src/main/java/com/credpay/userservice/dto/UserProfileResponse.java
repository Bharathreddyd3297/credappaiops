package com.credpay.userservice.dto;

import com.credpay.userservice.entity.User;

/**
 * The signed-in customer's profile:
 * { "userId": 3, "fullName": "...", "email": "..." }
 */
public record UserProfileResponse(Long userId, String fullName, String email) {

    public static UserProfileResponse fromEntity(User user) {
        return new UserProfileResponse(user.getId(), user.getFullName(), user.getEmail());
    }
}
