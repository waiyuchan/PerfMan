package com.code4faster.perfmanauthservice.service.impl;

import com.code4faster.perfmanauthservice.mapper.UserMapper;
import com.code4faster.perfmanauthservice.model.User;
import com.code4faster.perfmanauthservice.model.UserExample;
import com.code4faster.perfmanauthservice.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Override
    public User getUserByUsername(String username) {
        UserExample example = new UserExample();
        UserExample.Criteria criteria = example.createCriteria();
        criteria.andUsernameEqualTo(username);
        List<User> users = userMapper.selectByExample(example);
        return users.isEmpty() ? null : users.get(0);
    }
    @Override
    public void createUser(User user) {
        userMapper.insert(user);
    }
}
