package com.credpay.userservice.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class AddCardRequest {

    @NotBlank(message = "cardHolder is required")
    private String cardHolder;

    // Full PAN supplied by the client; only the masked form is persisted.
    @NotBlank(message = "cardNumber is required")
    @Pattern(regexp = "\\d{13,19}", message = "cardNumber must be 13-19 digits")
    private String cardNumber;

    @NotBlank(message = "cardNetwork is required")
    private String cardNetwork;

    @NotNull(message = "expiryMonth is required")
    @Min(value = 1, message = "expiryMonth must be between 1 and 12")
    @Max(value = 12, message = "expiryMonth must be between 1 and 12")
    private Integer expiryMonth;

    @NotNull(message = "expiryYear is required")
    private Integer expiryYear;
}
