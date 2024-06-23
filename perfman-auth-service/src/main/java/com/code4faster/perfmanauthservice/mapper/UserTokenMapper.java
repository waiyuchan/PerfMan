package com.code4faster.perfmanauthservice.mapper;

import com.code4faster.perfmanauthservice.model.UserToken;
import com.code4faster.perfmanauthservice.model.UserTokenExample;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface UserTokenMapper {
    long countByExample(UserTokenExample example);

    int deleteByExample(UserTokenExample example);

    int deleteByPrimaryKey(String id);

    int insert(UserToken record);

    int insertSelective(UserToken record);

    List<UserToken> selectByExample(UserTokenExample example);

    UserToken selectByPrimaryKey(String id);

    int updateByExampleSelective(@Param("record") UserToken record, @Param("example") UserTokenExample example);

    int updateByExample(@Param("record") UserToken record, @Param("example") UserTokenExample example);

    int updateByPrimaryKeySelective(UserToken record);

    int updateByPrimaryKey(UserToken record);
}