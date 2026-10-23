package com.credpay.userservice.repository;

import com.credpay.userservice.entity.Card;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CardRepository extends JpaRepository<Card, Long> {

    List<Card> findByUserId(Long userId);

    /** [userId, cardCount] for each of the given users that has cards. */
    @Query("select c.userId, count(c) from Card c where c.userId in :userIds group by c.userId")
    List<Object[]> countByUserIds(Collection<Long> userIds);
}
