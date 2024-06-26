package com.code4faster.perfmancommonservice.service;

import com.code4faster.perfmancommonservice.proto.TokenServiceGrpc;
import com.code4faster.perfmancommonservice.proto.TokenServiceProto;
import com.code4faster.perfmancommonservice.util.JwtUtil;
import io.grpc.stub.StreamObserver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TokenServiceImpl extends TokenServiceGrpc.TokenServiceImplBase {

    private final JwtUtil jwtUtil;

    @Autowired
    public TokenServiceImpl(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public void validateToken(TokenServiceProto.TokenRequest request, StreamObserver<TokenServiceProto.TokenResponse> responseObserver) {
        String token = request.getToken();
        boolean isValid = jwtUtil.validateToken(token);
        String username = isValid ? jwtUtil.getUsernameFromToken(token) : "";
        TokenServiceProto.TokenResponse response = TokenServiceProto.TokenResponse.newBuilder()
                .setValid(isValid)
                .setUsername(username)
                .build();
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
}
