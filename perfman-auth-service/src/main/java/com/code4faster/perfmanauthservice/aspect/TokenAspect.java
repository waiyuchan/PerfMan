package com.code4faster.perfmanauthservice.aspect;

import com.code4faster.perfmanauthservice.exception.AuthServiceException;
import com.code4faster.perfmanauthservice.util.JwtUtil;
import com.code4faster.perfmanauthservice.util.RedisUtil;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;

@Aspect
@Component
public class TokenAspect {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisUtil redisUtil;

    @Autowired
    private HttpServletRequest request;

    @Before("@annotation(com.code4faster.perfmanauthservice.annotation.TokenValidator)")
    public void checkToken() throws Exception {
        String token = request.getHeader("Authorization");
        if (token != null && jwtUtil.validateToken(token)) {
            String username = jwtUtil.extractUsername(token);
            if (redisUtil.hasKey(token)) {
                // 延长 token 的有效期
                redisUtil.set(token, username, jwtUtil.getExpiration());
                return;
            }
        }
        throw new AuthServiceException(401, "Invalid or expired token");
    }
}
