package com.code4faster.perfmanauthservice.service;

import com.code4faster.perfmanauthservice.exception.AuthServiceException;
import com.code4faster.perfmanauthservice.model.User;

public interface UserService {
    User getUserByUsername(String username) throws AuthServiceException;

    void createUser(User user) throws AuthServiceException;

    void activateUser(String username) throws AuthServiceException;

    User getUserByEmail(String email) throws AuthServiceException;

    void resetPassword(String username, String newPassword) throws AuthServiceException;

    void changePassword(String username, String newPassword) throws AuthServiceException;
}
