package com.credpay.userservice.controller;

import com.credpay.userservice.config.CorsConfig;
import com.credpay.userservice.config.SecurityConfig;
import com.credpay.userservice.dto.PageResponse;
import com.credpay.userservice.service.AdminService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin APIs are for the ADMIN role only. */
@WebMvcTest(AdminController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class AdminControllerSecurityTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AdminService adminService;

    @Test
    void rejectsRequestsWithoutToken() throws Exception {
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsCustomers() throws Exception {
        mvc.perform(get("/api/admin/users").with(jwt().authorities(() -> "ROLE_USER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void allowsAdmins() throws Exception {
        when(adminService.listUsers(null, 0, 20)).thenReturn(new PageResponse<>(List.of(), 0, 0, 20));

        mvc.perform(get("/api/admin/users").with(jwt().authorities(() -> "ROLE_ADMIN")))
                .andExpect(status().isOk());
    }
}
