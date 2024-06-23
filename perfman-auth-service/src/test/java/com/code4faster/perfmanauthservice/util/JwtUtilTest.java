package com.code4faster.perfmanauthservice.util;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.*;

public class JwtUtilTest {

    @InjectMocks
    private JwtUtil jwtUtil;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        jwtUtil.setSecret("testSecret");
        jwtUtil.setExpiration(60000); // 1 minute
    }

    @Test
    public void testGenerateToken() {
        String token = jwtUtil.generateToken("testUser");
        assertNotNull(token);
    }

    @Test
    public void testGetClaimsFromToken() {
        String token = jwtUtil.generateToken("testUser");
        Claims claims = jwtUtil.getClaimsFromToken(token);
        assertEquals("testUser", claims.getSubject());
    }

    @Test
    public void testGetUsernameFromToken() {
        String token = jwtUtil.generateToken("testUser");
        String username = jwtUtil.getUsernameFromToken(token);
        assertEquals("testUser", username);
    }

    @Test
    public void testIsTokenExpired() {
        String token = jwtUtil.generateToken("testUser");
        boolean isExpired = jwtUtil.isTokenExpired(token);
        assertFalse(isExpired);
    }
}
