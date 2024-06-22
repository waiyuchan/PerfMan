package com.code4faster.perfmandiscoveryservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

@SpringBootApplication
@EnableEurekaServer
public class PerfmanDiscoveryServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PerfmanDiscoveryServiceApplication.class, args);
    }

}
