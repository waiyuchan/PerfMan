package com.code4faster.perfmanauthservice.util;

import com.code4faster.perfmanauthservice.common.ResponseResult;

public class ResponseUtil {

    public static <T> ResponseResult<T> success(T data) {
        return new ResponseResult<>(0, "", data);
    }

    public static ResponseResult<?> failure(int code, String message) {
        return new ResponseResult<>(code, message, null);
    }
}
