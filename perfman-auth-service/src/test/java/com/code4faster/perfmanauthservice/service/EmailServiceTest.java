package com.code4faster.perfmanauthservice.service;

import com.code4faster.perfmanauthservice.service.impl.EmailServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.mockito.Mockito.*;

public class EmailServiceTest {

    @InjectMocks
    private EmailServiceImpl emailService;

    @Mock
    private JavaMailSender emailSender;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    public void testSendVerificationEmail() {
        doNothing().when(emailSender).send(any(SimpleMailMessage.class));

        emailService.sendVerificationEmail("test@example.com", "token");

        verify(emailSender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    public void testSendPasswordResetEmail() {
        doNothing().when(emailSender).send(any(SimpleMailMessage.class));

        emailService.sendPasswordResetEmail("test@example.com", "token");

        verify(emailSender, times(1)).send(any(SimpleMailMessage.class));
    }
}
