package com.code4faster.perfmanauthservice.service.impl;

import com.code4faster.perfmanauthservice.service.EmailService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailServiceImpl implements EmailService {

    @Autowired
    private JavaMailSender emailSender;

    @Override
    public void sendVerificationEmail(String email, String token) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Email Verification");
        message.setText("Please verify your email by clicking the following link: " +
                "http://code4faster.com/verify?token=" + token);
        emailSender.send(message);
    }

    @Override
    public void sendPasswordResetEmail(String email, String token) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Password Reset");
        message.setText("Please reset your password by clicking the following link: " +
                "http://code4faster.com/reset-password?token=" + token);
        emailSender.send(message);
    }
}
