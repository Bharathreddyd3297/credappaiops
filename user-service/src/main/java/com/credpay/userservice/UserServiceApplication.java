package com.credpay.userservice;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class UserServiceApplication {

    public static void main(String[] args) {
        // Run in UTC. On Windows in India the JVM default is the legacy
        // "Asia/Calcutta" zone ID, which PostgreSQL 17 rejects at connect time
        // (FATAL: invalid value for parameter "TimeZone").
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
