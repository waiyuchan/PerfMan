package com.code4faster.perfmanauthservice.controller;

import com.code4faster.perfmanauthservice.annotation.TokenValidator;
import com.code4faster.perfmanauthservice.common.ResponseResult;
import com.code4faster.perfmanauthservice.dto.RegisterRequest;
import com.code4faster.perfmanauthservice.dto.LoginRequest;
import com.code4faster.perfmanauthservice.model.User;
import com.code4faster.perfmanauthservice.service.EmailService;
import com.code4faster.perfmanauthservice.service.UserService;
import com.code4faster.perfmanauthservice.util.JwtUtil;
import com.code4faster.perfmanauthservice.util.RedisUtil;
import com.code4faster.perfmanauthservice.util.ResponseUtil;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private Logger logger;

    @Autowired
    private UserService userService;

    @Autowired
    private EmailService emailService;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisUtil redisUtil;

    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @PostMapping("/register")
    public ResponseResult<?> registerUser(@RequestBody RegisterRequest registerRequest) {
        logger.info("请求参数:" + registerRequest.toString());
        User user = new User();
        user.setUsername(registerRequest.getUsername());
        user.setPasswordHash(passwordEncoder.encode(registerRequest.getPassword()));
        user.setEmail(registerRequest.getEmail());
        userService.createUser(user);
        String token = jwtUtil.generateToken(user.getUsername());
        redisUtil.set(token, user.getUsername(), 24 * 60 * 60 * 1000); // 24 hours
        emailService.sendVerificationEmail(user.getEmail(), token);
        return ResponseUtil.success(null);
    }

    @PostMapping("/login")
    public ResponseResult<?> loginUser(@RequestBody LoginRequest loginRequest) {
        User existingUser = userService.getUserByUsername(loginRequest.getUsername());
        if (existingUser != null && passwordEncoder.matches(loginRequest.getPassword(), existingUser.getPasswordHash())) {
            String token = jwtUtil.generateToken(existingUser.getUsername());
            redisUtil.set(token, existingUser.getUsername(), jwtUtil.getExpiration());
            Map<String, String> response = new HashMap<>();
            response.put("token", token);
            return ResponseUtil.success(response);
        }
        return ResponseUtil.failure(401, "Invalid username or password");
    }

    @PostMapping("/logout")
    @TokenValidator
    public ResponseResult<?> logoutUser(@RequestHeader("Authorization") String token) {
        if (redisUtil.delete(token.substring(7))) {
            return ResponseUtil.success(null);
        }
        return ResponseUtil.failure(401, "Invalid token");
    }

    @GetMapping("/user_info")
    @TokenValidator
    public ResponseResult<?> getUserInfo(@RequestHeader("Authorization") String token) {
        String username = jwtUtil.getUsernameFromToken(token.substring(7));
        User user = userService.getUserByUsername(username);
        if (user != null) {
            return ResponseUtil.success(user);
        }
        return ResponseUtil.failure(404, "User not found");
    }

    @PostMapping("/token/refresh")
    @TokenValidator
    public ResponseResult<?> refreshToken(@RequestHeader("Authorization") String token) {
        String username = jwtUtil.getUsernameFromToken(token.substring(7));
        String newToken = jwtUtil.generateToken(username);
        redisUtil.set(newToken, username, jwtUtil.getExpiration());
        redisUtil.delete(token.substring(7));
        Map<String, String> response = new HashMap<>();
        response.put("token", newToken);
        return ResponseUtil.success(response);
    }

    @PostMapping("/verify_email")
    public ResponseResult<?> verifyEmail(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        if (jwtUtil.isTokenExpired(token)) {
            return ResponseUtil.failure(401, "Token has expired");
        }
        String username = jwtUtil.getUsernameFromToken(token);
        if (username == null || !redisUtil.hasKey(token)) {
            return ResponseUtil.failure(400, "Invalid token");
        }
        userService.activateUser(username);
        redisUtil.delete(token); // Remove the token as it's no longer needed
        return ResponseUtil.success(null);
    }

    @PostMapping("/request_reset_password")
    public ResponseResult<?> requestResetPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        User user = userService.getUserByEmail(email);
        if (user != null) {
            String token = jwtUtil.generateToken(user.getUsername());
            redisUtil.set(token, user.getUsername(), 15 * 60 * 1000); // 15 minutes
            emailService.sendPasswordResetEmail(email, token);
        }
        return ResponseUtil.success(null);
    }

    @PostMapping("/reset_password")
    public ResponseResult<?> resetPassword(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        String newPassword = request.get("newPassword");

        if (jwtUtil.isTokenExpired(token)) {
            return ResponseUtil.failure(401, "Token has expired");
        }

        String username = jwtUtil.getUsernameFromToken(token);
        if (username == null || !redisUtil.hasKey(token)) {
            return ResponseUtil.failure(400, "Invalid token");
        }

        userService.resetPassword(username, newPassword);
        redisUtil.delete(token); // Remove the token as it's no longer needed

        return ResponseUtil.success(null);
    }

    @PostMapping("/change_password")
    @TokenValidator
    public ResponseResult<?> changePassword(@RequestHeader("Authorization") String token, @RequestBody Map<String, String> request) {
        String oldPassword = request.get("oldPassword");
        String newPassword = request.get("newPassword");

        String username = jwtUtil.getUsernameFromToken(token.substring(7));
        User user = userService.getUserByUsername(username);

        if (user != null && passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            userService.changePassword(username, newPassword);
            return ResponseUtil.success(null);
        } else {
            return ResponseUtil.failure(401, "Invalid old password");
        }
    }
}
