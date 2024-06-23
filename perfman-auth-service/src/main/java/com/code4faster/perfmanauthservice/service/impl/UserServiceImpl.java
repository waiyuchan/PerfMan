package com.code4faster.perfmanauthservice.service.impl;

import com.code4faster.perfmanauthservice.common.ErrorCodes;
import com.code4faster.perfmanauthservice.exception.AuthServiceException;
import com.code4faster.perfmanauthservice.mapper.UserMapper;
import com.code4faster.perfmanauthservice.model.User;
import com.code4faster.perfmanauthservice.model.UserExample;
import com.code4faster.perfmanauthservice.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Override
    public User getUserByUsername(String username) throws AuthServiceException {
        UserExample example = new UserExample();
        UserExample.Criteria criteria = example.createCriteria();
        criteria.andUsernameEqualTo(username);
        List<User> users = userMapper.selectByExample(example);
        if (users.isEmpty()) {
            throw new AuthServiceException(404, ErrorCodes.USER_NOT_FOUND);
        }
        return users.get(0);
    }

    @Override
    public void createUser(User user) throws AuthServiceException {
        UserExample example = new UserExample();
        UserExample.Criteria criteria = example.createCriteria();
        criteria.andUsernameEqualTo(user.getUsername());
        if (!userMapper.selectByExample(example).isEmpty()) {
            throw new AuthServiceException(409, ErrorCodes.USER_ALREADY_EXISTS);
        }
        user.setPasswordHash(passwordEncoder.encode(user.getPasswordHash()));
        userMapper.insert(user);
    }

    @Override
    public void activateUser(String username) throws AuthServiceException {
        User user = getUserByUsername(username);
        user.setStatus(1); // Assuming there is an 'active' field in the User model
        userMapper.updateByPrimaryKey(user);
    }

    @Override
    public User getUserByEmail(String email) throws AuthServiceException {
        UserExample example = new UserExample();
        UserExample.Criteria criteria = example.createCriteria();
        criteria.andEmailEqualTo(email);
        List<User> users = userMapper.selectByExample(example);
        if (users.isEmpty()) {
            throw new AuthServiceException(404, ErrorCodes.USER_NOT_FOUND);
        }
        return users.get(0);
    }

    @Override
    public void resetPassword(String username, String newPassword) throws AuthServiceException {
        User user = getUserByUsername(username);
        if (user == null) {
            throw new AuthServiceException(404, ErrorCodes.USER_NOT_FOUND);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword)); // Assuming password is hashed
        userMapper.updateByPrimaryKey(user);
    }

    @Override
    public void changePassword(String username, String newPassword) throws AuthServiceException {
        resetPassword(username, newPassword);
    }

    // 添加setter方法以支持测试中注入
    public void setUserMapper(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public void setPasswordEncoder(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }
}
