package com.code4faster.perfmanauthservice.service;

import com.code4faster.perfmanauthservice.common.ErrorCodes;
import com.code4faster.perfmanauthservice.exception.AuthServiceException;
import com.code4faster.perfmanauthservice.mapper.UserMapper;
import com.code4faster.perfmanauthservice.model.User;
import com.code4faster.perfmanauthservice.model.UserExample;
import com.code4faster.perfmanauthservice.service.impl.UserServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

public class UserServiceTest {

    @InjectMocks
    private UserServiceImpl userService;

    @Mock
    private UserMapper userMapper;

    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        userService.setUserMapper(userMapper);
        userService.setPasswordEncoder(passwordEncoder);
    }

    @Test
    public void testResetPassword() {
        User user = new User();
        user.setUsername("test");
        user.setPasswordHash("oldPassword");

        List<User> users = new ArrayList<>();
        users.add(user);

        UserExample example = new UserExample();
        example.createCriteria().andUsernameEqualTo("test");

        when(userMapper.selectByExample(any(UserExample.class))).thenReturn(users);

        userService.resetPassword("test", "newPassword");

        assertTrue(passwordEncoder.matches("newPassword", user.getPasswordHash()));

        verify(userMapper, times(1)).updateByPrimaryKey(user);
    }
}
