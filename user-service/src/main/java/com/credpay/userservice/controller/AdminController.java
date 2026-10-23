package com.credpay.userservice.controller;

import com.credpay.userservice.dto.AdminUserResponse;
import com.credpay.userservice.dto.PageResponse;
import com.credpay.userservice.dto.UserSummaryResponse;
import com.credpay.userservice.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin portal APIs. Every path under /api/admin requires the ADMIN role
 * (see SecurityConfig); customers get 403.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;

    @GetMapping("/users")
    public PageResponse<AdminUserResponse> users(@RequestParam(required = false) String search,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        return adminService.listUsers(search, page, size);
    }

    @GetMapping("/users/summary")
    public UserSummaryResponse summary() {
        return adminService.summary();
    }
}
