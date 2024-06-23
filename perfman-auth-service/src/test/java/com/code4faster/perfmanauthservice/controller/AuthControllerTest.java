package com.code4faster.perfmanauthservice.controller;

import com.code4faster.perfmanauthservice.common.ResponseResult;
import com.code4faster.perfmanauthservice.model.User;
import com.code4faster.perfmanauthservice.service.EmailService;
import com.code4faster.perfmanauthservice.service.UserService;
import com.code4faster.perfmanauthservice.util.JwtUtil;
import com.code4faster.perfmanauthservice.util.RedisUtil;
import com.code4faster.perfmanauthservice.util.ResponseUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

public class AuthControllerTest {

    @InjectMocks
    private AuthController authController;

    @Mock
    private UserService userService;

    @Mock
    private EmailService emailService;

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private RedisUtil redisUtil;

    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        jwtUtil.setSecret("testSecret");
        jwtUtil.setExpiration(60000); // 1 minute
    }

    @Test
    public void testRegisterUser() {
        User user = new User();
        user.setUsername("test");
        user.setPasswordHash("password");
        user.setEmail("test@example.com");

        doNothing().when(userService).createUser(any(User.class));
        when(jwtUtil.generateToken(anyString())).thenReturn("token");
        doNothing().when(emailService).sendVerificationEmail(anyString(), anyString());
        doNothing().when(redisUtil).set(anyString(), anyString(), anyLong());

        ResponseResult<?> response = authController.registerUser(user);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testLoginUserSuccess() {
        User user = new User();
        user.setUsername("test");
        user.setPasswordHash(passwordEncoder.encode("password"));

        when(userService.getUserByUsername(anyString())).thenReturn(user);
        when(jwtUtil.generateToken(anyString())).thenReturn("token");
        doNothing().when(redisUtil).set(anyString(), anyString(), anyLong());

        User loginUser = new User();
        loginUser.setUsername("test");
        loginUser.setPasswordHash("password");

        ResponseResult<?> response = authController.loginUser(loginUser);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testLoginUserFailure() {
        when(userService.getUserByUsername(anyString())).thenReturn(null);

        User loginUser = new User();
        loginUser.setUsername("test");
        loginUser.setPasswordHash("password");

        ResponseResult<?> response = authController.loginUser(loginUser);
        assertEquals(401, response.getCode());
    }

    @Test
    public void testLogoutUser() {
        String token = "Bearer testToken";
        when(redisUtil.delete(anyString())).thenReturn(true);

        ResponseResult<?> response = authController.logoutUser(token);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testGetUserInfo() {
        String token = "Bearer testToken";
        User user = new User();
        user.setUsername("test");

        when(jwtUtil.getUsernameFromToken(anyString())).thenReturn("test");
        when(userService.getUserByUsername(anyString())).thenReturn(user);

        ResponseResult<?> response = authController.getUserInfo(token);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testRefreshToken() {
        String token = "Bearer testToken";
        String newToken = "newToken";

        when(jwtUtil.getUsernameFromToken(anyString())).thenReturn("test");
        when(jwtUtil.generateToken(anyString())).thenReturn(newToken);
        doNothing().when(redisUtil).set(anyString(), anyString(), anyLong());
        when(redisUtil.delete(anyString())).thenReturn(true);

        ResponseResult<?> response = authController.refreshToken(token);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testVerifyEmail() {
        String token = "testToken";

        when(jwtUtil.isTokenExpired(anyString())).thenReturn(false);
        when(jwtUtil.getUsernameFromToken(anyString())).thenReturn("test");
        when(redisUtil.hasKey(anyString())).thenReturn(true);
        doNothing().when(userService).activateUser(anyString());
        when(redisUtil.delete(anyString())).thenReturn(true);

        Map<String, String> request = new HashMap<>();
        request.put("token", token);

        ResponseResult<?> response = authController.verifyEmail(request);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testRequestResetPassword() {
        String email = "test@example.com";
        User user = new User();
        user.setEmail(email);
        user.setUsername("test");

        when(userService.getUserByEmail(anyString())).thenReturn(user);
        when(jwtUtil.generateToken(anyString())).thenReturn("token");
        doNothing().when(redisUtil).set(anyString(), anyString(), anyLong());
        doNothing().when(emailService).sendPasswordResetEmail(anyString(), anyString());

        Map<String, String> request = new HashMap<>();
        request.put("email", email);

        ResponseResult<?> response = authController.requestResetPassword(request);
        assertEquals(0, response.getCode());
    }

    @Test
    public void testResetPassword() {
        String token = "testToken";
        String newPassword = "newPassword";
        String username = "testUser";

        when(jwtUtil.isTokenExpired(anyString())).thenReturn(false);
        when(jwtUtil.getUsernameFromToken(anyString())).thenReturn(username);
        when(redisUtil.hasKey(anyString())).thenReturn(true);
        doNothing().when(userService).resetPassword(anyString(), anyString());
        when(redisUtil.delete(anyString())).thenReturn(true);

        Map<String, String> request = new HashMap<>();
        request.put("token", token);
        request.put("newPassword", newPassword);

        ResponseResult<?> response = authController.resetPassword(request);
        assertEquals(0, response.getCode());
    }


    @Test
    public void testChangePassword() {
        User user = new User();
        user.setUsername("test");
        user.setPasswordHash(passwordEncoder.encode("oldPassword"));

        when(jwtUtil.getUsernameFromToken(anyString())).thenReturn("test");
        when(userService.getUserByUsername(anyString())).thenReturn(user);
        doNothing().when(userService).changePassword(anyString(), anyString());

        Map<String, String> request = new HashMap<>();
        request.put("oldPassword", "oldPassword");
        request.put("newPassword", "newPassword");

        ResponseResult<?> response = authController.changePassword("Bearer token", request);
        assertEquals(0, response.getCode());
    }
}
