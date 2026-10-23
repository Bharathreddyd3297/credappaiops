package com.credpay.userservice.service;

import com.credpay.userservice.dto.AdminUserResponse;
import com.credpay.userservice.dto.PageResponse;
import com.credpay.userservice.dto.UserSummaryResponse;
import com.credpay.userservice.entity.User;
import com.credpay.userservice.repository.CardRepository;
import com.credpay.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Read-only customer data for administrators. */
@Service
@RequiredArgsConstructor
public class AdminService {

    public static final int MAX_PAGE_SIZE = 100;

    private final UserRepository userRepository;
    private final CardRepository cardRepository;

    /** Newest customers first; optional search on email or name. */
    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> listUsers(String search, int page, int size) {
        PageRequest pageRequest = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<User> users = (search == null || search.isBlank())
                ? userRepository.findAll(pageRequest)
                : userRepository.findByEmailContainingIgnoreCaseOrFullNameContainingIgnoreCase(
                        search.trim(), search.trim(), pageRequest);

        Map<Long, Long> cardCounts = cardCounts(users.getContent());
        List<AdminUserResponse> items = users.getContent().stream()
                .map(user -> AdminUserResponse.fromEntity(user, cardCounts.getOrDefault(user.getId(), 0L)))
                .toList();

        return new PageResponse<>(items, users.getTotalElements(), users.getNumber(), users.getSize());
    }

    @Transactional(readOnly = true)
    public UserSummaryResponse summary() {
        return new UserSummaryResponse(
                userRepository.count(),
                userRepository.countByCreatedAtAfter(OffsetDateTime.now().minusDays(7)),
                cardRepository.count());
    }

    // One query for the whole page instead of one per user
    private Map<Long, Long> cardCounts(List<User> users) {
        Map<Long, Long> counts = new HashMap<>();
        if (users.isEmpty()) {
            return counts;
        }
        for (Object[] row : cardRepository.countByUserIds(users.stream().map(User::getId).toList())) {
            counts.put((Long) row[0], (Long) row[1]);
        }
        return counts;
    }
}
