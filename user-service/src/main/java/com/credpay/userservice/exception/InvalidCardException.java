package com.credpay.userservice.exception;

/** Thrown when card details fail business validation (e.g. expired year). */
public class InvalidCardException extends RuntimeException {
    public InvalidCardException(String message) {
        super(message);
    }
}
