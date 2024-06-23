package com.code4faster.perfmanauthservice;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@SpringBootApplication
@EnableEurekaClient
@MapperScan("com.code4faster.perfmanauthservice.mapper")
public class PerfmanAuthServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PerfmanAuthServiceApplication.class, args);
    }

}
