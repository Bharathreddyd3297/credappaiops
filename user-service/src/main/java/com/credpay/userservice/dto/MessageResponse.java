package com.credpay.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Standard single-field response body, e.g.
 * { "message": "User registered successfully" }
 */
@Data
@AllArgsConstructor
public class MessageResponse {
    private String message;
}
