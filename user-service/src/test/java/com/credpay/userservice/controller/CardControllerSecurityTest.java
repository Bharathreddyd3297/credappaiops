package com.credpay.userservice.controller;

import com.credpay.userservice.config.CorsConfig;
import com.credpay.userservice.config.SecurityConfig;
import com.credpay.userservice.entity.User;
import com.credpay.userservice.service.CardService;
import com.credpay.userservice.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The card APIs need a customer token, and always act on the token's own user. */
@WebMvcTest(CardController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class CardControllerSecurityTest {

    private static final String VALID_CARD = """
            {"cardHolder":"Demo","cardNumber":"4111111111111111","cardNetwork":"VISA",
             "expiryMonth":12,"expiryYear":2099}""";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private CardService cardService;

    @MockitoBean
    private UserService userService;

    @Test
    void rejectsRequestsWithoutToken() throws Exception {
        mvc.perform(get("/api/cards")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsAdminTokenOnCustomerApi() throws Exception {
        mvc.perform(get("/api/cards").with(jwt().authorities(() -> "ROLE_ADMIN")))
                .andExpect(status().isForbidden());
    }

    @Test
    void listsOnlyTheTokenUsersCards() throws Exception {
        when(userService.currentUser(any())).thenReturn(User.builder().id(7L).build());
        when(cardService.getCardsByUser(7L)).thenReturn(List.of());

        mvc.perform(get("/api/cards").with(jwt().authorities(() -> "ROLE_USER")))
                .andExpect(status().isOk());
        verify(cardService).getCardsByUser(7L);
    }

    @Test
    void addsCardForTheTokenUser() throws Exception {
        when(userService.currentUser(any())).thenReturn(User.builder().id(7L).build());

        mvc.perform(post("/api/cards")
                        .with(jwt().authorities(() -> "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_CARD))
                .andExpect(status().isCreated());
        verify(cardService).addCard(eq(7L), any());
    }

    @Test
    void rejectsInvalidCardRequest() throws Exception {
        mvc.perform(post("/api/cards")
                        .with(jwt().authorities(() -> "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cardNumber\":\"12\"}"))
                .andExpect(status().isBadRequest());
    }
}
