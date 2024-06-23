package com.code4faster.perfmanauthservice.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

public class RedisUtilTest {

    @InjectMocks
    private RedisUtil redisUtil;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    public void testSet() {
        doNothing().when(valueOperations).set(anyString(), anyString(), anyLong(), any(TimeUnit.class));
        redisUtil.set("testKey", "testValue", 60000);
        verify(valueOperations, times(1)).set(anyString(), anyString(), anyLong(), any(TimeUnit.class));
    }

    @Test
    public void testDelete() {
        when(redisTemplate.delete(anyString())).thenReturn(true);
        boolean result = redisUtil.delete("testKey");
        assertTrue(result);
    }

    @Test
    public void testHasKey() {
        when(redisTemplate.hasKey(anyString())).thenReturn(true);
        boolean result = redisUtil.hasKey("testKey");
        assertTrue(result);
    }
}
