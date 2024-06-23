package com.code4faster.perfmanauthservice.exception;

public class AuthServiceException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public AuthServiceException(String message) {
        super(message);
    }
}
