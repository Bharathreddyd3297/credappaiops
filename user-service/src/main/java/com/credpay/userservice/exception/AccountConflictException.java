package com.credpay.userservice.exception;

/** Thrown when a Keycloak account cannot be linked to an existing CredPay user. */
public class AccountConflictException extends RuntimeException {
    public AccountConflictException(String message) {
        super(message);
    }
}
