package com.code4faster.perfmanauthservice.exception;

import com.code4faster.perfmanauthservice.common.ResponseResult;
import com.code4faster.perfmanauthservice.util.ResponseUtil;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AuthServiceException.class)
    public ResponseResult<?> handleAuthServiceException(AuthServiceException e) {
        return ResponseUtil.failure(e.getErrorCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseResult<?> handleException(Exception e) {
        return ResponseUtil.failure(500, e.getMessage());
    }
}

