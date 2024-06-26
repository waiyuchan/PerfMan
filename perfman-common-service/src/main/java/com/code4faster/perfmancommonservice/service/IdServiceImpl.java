package com.code4faster.perfmancommonservice.service;

import com.code4faster.perfmancommonservice.proto.IdServiceGrpc;
import com.code4faster.perfmancommonservice.proto.IdServiceProto;
import com.code4faster.perfmancommonservice.util.IdGenerator;
import io.grpc.stub.StreamObserver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class IdServiceImpl extends IdServiceGrpc.IdServiceImplBase {

    private final IdGenerator idGenerator;

    @Autowired
    public IdServiceImpl(IdGenerator idGenerator) {
        this.idGenerator = idGenerator;
    }

    @Override
    public void generateId(IdServiceProto.IdRequest request, StreamObserver<IdServiceProto.IdResponse> responseObserver) {
        long id = idGenerator.nextId();
        IdServiceProto.IdResponse response = IdServiceProto.IdResponse.newBuilder().setId(id).build();
        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
}
