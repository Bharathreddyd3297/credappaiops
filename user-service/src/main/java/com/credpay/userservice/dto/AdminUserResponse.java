package com.credpay.userservice.dto;

import com.credpay.userservice.entity.User;

import java.time.OffsetDateTime;

/** A customer as shown in the admin portal's Users page. */
public record AdminUserResponse(Long id, String fullName, String email, OffsetDateTime createdAt, long cardCount) {

    public static AdminUserResponse fromEntity(User user, long cardCount) {
        return new AdminUserResponse(user.getId(), user.getFullName(), user.getEmail(), user.getCreatedAt(), cardCount);
    }
}
