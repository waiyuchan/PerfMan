package com.code4faster.perfmanauthservice.interceptor;

import com.code4faster.perfmanauthservice.util.JwtUtil;
import com.code4faster.perfmanauthservice.util.RedisUtil;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
public class TokenInterceptor implements HandlerInterceptor {

    @Autowired
    private Logger logger;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisUtil redisUtil;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            // 允许CORS预检请求通过
            return true;
        }

        String token = request.getHeader("Authorization");
        if (token != null && jwtUtil.validateToken(token)) {
            String username = jwtUtil.extractUsername(token);
            if (redisUtil.hasKey(token)) {
                // 延长 token 的有效期
                redisUtil.set(token, username, jwtUtil.getExpiration());
                logger.info("Token is valid for user: {}", username);
                return true;
            } else {
                logger.warn("Token not found in Redis for user: {}", username);
            }
        } else {
            logger.warn("Invalid token: {}", token);
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        return false;
    }
}
