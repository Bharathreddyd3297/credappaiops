package com.credpay.userservice.dto;

import java.util.List;

/**
 * One page of results:
 * { "items": [...], "total": 42, "page": 0, "size": 20 }
 * Same shape as payment-service's admin list responses.
 */
public record PageResponse<T>(List<T> items, long total, int page, int size) {
}
