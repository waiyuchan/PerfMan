package com.code4faster.perfmanauthservice.exception;

public class AuthServiceException extends RuntimeException {
    private int errorCode;

    public AuthServiceException(int errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public int getErrorCode() {
        return errorCode;
    }
}

