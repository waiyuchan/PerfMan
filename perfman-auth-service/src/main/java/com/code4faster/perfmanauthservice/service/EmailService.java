package com.code4faster.perfmanauthservice.service;

public interface EmailService {
    void sendVerificationEmail(String email, String token);

    void sendPasswordResetEmail(String email, String token);
}
