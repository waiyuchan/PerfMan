package com.code4faster.perfmancommonservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import net.devh.boot.grpc.server.autoconfigure.EnableGrpcServer;

@SpringBootApplication
@EnableDiscoveryClient
@EnableGrpcServer
public class PerfmanCommonServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PerfmanCommonServiceApplication.class, args);
    }
}
