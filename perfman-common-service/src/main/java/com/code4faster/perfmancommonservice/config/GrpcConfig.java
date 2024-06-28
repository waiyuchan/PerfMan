package com.code4faster.perfmancommonservice.config;

import org.springframework.context.annotation.Configuration;
import net.devh.boot.grpc.server.serverfactory.GrpcServerFactory;
import net.devh.boot.grpc.server.serverfactory.GrpcServerConfigurer;
import io.grpc.ServerBuilder;

import java.util.function.Consumer;

@Configuration
public class GrpcConfig implements GrpcServerConfigurer {
    @Override
    public void accept(ServerBuilder<?> serverBuilder) {

    }
}
