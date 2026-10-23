package com.credpay.userservice.dto;

/** Customer numbers for the admin portal's Overview page. */
public record UserSummaryResponse(long totalUsers, long newUsersLast7Days, long totalCards) {
}
