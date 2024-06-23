package com.code4faster.perfmanauthservice.service;

import com.code4faster.perfmanauthservice.model.User;

public interface UserService {
    User getUserByUsername(String username);
    void createUser(User user);

}
