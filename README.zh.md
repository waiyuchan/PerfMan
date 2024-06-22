<div align="center">
    <img src="resources/img/logo_with_name.png" height="100px"/>
    <h1>PerfMan: 性能测试管理平台</h1>
</div>

<div align="center">
    <img src="https://img.shields.io/badge/Language-Java-orange.svg" />
    <img src="https://img.shields.io/badge/ORM-MyBatis-blue.svg" />
    <img src="https://img.shields.io/badge/Architecture-Spring Cloud-6db33f.svg" />
</div>

<h4 align="center">
    中文 | <a href="README.md">English</a>
</h4>

PerfMan 是一个基于Spring Cloud微服务架构的开源综合性能管理平台，旨在为现代云应用提供一站式的环境管理、项目管理、测试场景和任务管理、通知管理等解决方案。

## 功能特点

- **服务发现**: 使用Eureka实现的中心化服务注册与发现。
- **API网关**: 使用Spring Cloud Gateway实现的统一服务入口。
- **配置管理**: 通过Spring Cloud Config实现的中心化配置管理。
- **身份与访问管理**: 支持用户注册、登录、权限控制。
- **通知服务**: 实现应用内和邮件通知。
- **环境与资源管理**: 管理节点、集群并监控资源。
- **项目管理**: 提供项目创建、成员管理、项目搜索等功能。
- **测试管理**: 创建、管理和执行测试场景与任务。
- **告警服务**: 可配置的告警规则和通知设置。

## 快速开始

### 环境要求

- JDK 8 或更高版本
- Maven 3.8 或更高版本

### 安装步骤

克隆PerfMan项目仓库：

```bash
git clone https://github.com/waiyuchan/PerfMan.git
cd perfman
```

使用Maven构建项目：

```bash
mvn clean install
```

##  配置中心更新指南

### 简介

此指南介绍如何通过更新Git仓库中的配置文件来更新PerfMan项目的配置中心配置。配置中心使用Spring Cloud Config Server，从Git仓库中拉取配置文件，并将其提供给各个微服务。

### 步骤

#### 1. 克隆配置仓库

首先，克隆配置仓库到本地：

```bash
git clone https://github.com/waiyuchan/perfman-config-repo.git
cd perfman-config-repo
```

### 2. 更新配置文件

在克隆下来的仓库中，找到需要更新的配置文件，例如 `application.yml` 或具体服务的配置文件（如 `perfman-project-service.yml`）。

#### 操作示例：

更新 `application.yml` 文件：

```yaml
# application.yml
spring:
  application:
    name: perfman-config-service
    # 新增或修改配置项
    new-property: newValue
```

更新 `perfman-project-service.yml` 文件：

```yaml
# perfman-project-service.yml
project:
  setting1: newValue1
  setting2: newValue2
```

### 3. 提交并推送更改

将更改提交到Git仓库：

```bash
git add .
git commit -m "Update configuration for perfman-project-service"
git push origin master
```

### 4. 刷新配置

为了使更改生效，需要通知配置中心刷新配置。可以通过以下两种方式实现：

#### 方式一：使用Spring Boot Actuator端点刷新

如果客户端应用启用了Spring Boot Actuator，可以访问 `/actuator/refresh` 端点刷新配置。

```bash
curl -X POST http://localhost:8080/actuator/refresh
```

#### 方式二：手动重启客户端应用

手动重启需要更新配置的客户端应用，使其重新从配置中心拉取最新的配置。

### 常见问题

#### 问题1：配置未生效

确保已经推送更改到Git仓库，并且客户端应用已经刷新配置或重启。

#### 问题2：配置拉取失败

检查配置中心的 `application.yml` 文件中的Git仓库配置是否正确：

```yaml
spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/waiyuchan/perfman-config-repo
          search-paths: config-repo
          clone-on-start: true
```

确保Git仓库的URL正确，且仓库中包含需要的配置文件。

## 基于Eureka的新服务注册和发现

### 步骤

#### 1. 添加Eureka Client依赖

在服务的 `pom.xml` 文件中添加 Spring Cloud Netflix Eureka Client 的依赖：

```xml
<dependencies>
    <!-- Other dependencies -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
    </dependency>
</dependencies>
```

#### 2. 配置 `application.yml`

在服务的 `src/main/resources/application.yml` 文件中添加 Eureka 客户端配置：

```yaml
spring:
  application:
    name: <service-name>  # 替换为具体服务名称

  cloud:
    config:
      uri: http://localhost:8888  # Config Server的地址
      name: <service-name>  # 替换为具体服务名称
      profile: default

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true

management:
  endpoints:
    web:
      exposure:
        include: "*"
```

#### 3. 启用Eureka客户端

在服务的主类文件中启用Eureka客户端。假设主类文件为 `PerfmanServiceApplication.java`：

```java
package com.perfman.service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;

@SpringBootApplication
@EnableEurekaClient
public class PerfmanServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PerfmanServiceApplication.class, args);
    }
}
```

#### 4. 启动服务

按照以下步骤启动服务：

1. 确保 `perfman-discovery-service` 已经启动并运行在 `http://localhost:8761`。
2. 启动新的服务，该服务将在启动时自动注册到Eureka。

#### 5. 验证服务注册

在浏览器中访问 `http://localhost:8761`，可以看到已经注册到Eureka的所有服务，包括新的服务。

#### 6. 配置其他服务调用新服务

其他服务可以通过服务名称调用新注册的服务，确保所有服务都可以互相发现。以下是一个示例：

```yaml
# 其他服务的 application.yml 配置
spring:
  application:
    name: other-service

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true
```

在代码中使用 `RestTemplate` 调用新服务：

```java
package com.perfman.otherservice;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class OtherService {

    @Autowired
    private RestTemplate restTemplate;

    public String callNewService() {
        return restTemplate.getForObject("http://<service-name>/endpoint", String.class);
    }
}

@Configuration
class Config {
    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
```

#### 常见问题

##### 问题1：服务未注册到Eureka

- 确保服务的 `application.yml` 文件中已正确配置Eureka客户端。
- 确保Eureka服务器（perfman-discovery-service）已启动并运行在指定地址。

##### 问题2：服务无法发现其他服务

- 确保所有服务都已正确注册到Eureka，并且Eureka服务器运行正常。
- 检查服务名称是否正确，确保服务名称与Eureka中注册的名称一致。


### 运行服务

启动Eureka Server：

```bash
cd perfman-discovery-service
mvn spring-boot:run
```

重复上述步骤以启动其它服务，将`perfman-discovery-service`替换为您想要启动的服务目录名。

## 文档

更详细的文档，请访问[Wiki页面](https://github.com/yourusername/perfman/wiki)。

## 贡献指南

欢迎为PerfMan贡献力量！请阅读我们的[贡献指南](CONTRIBUTING.md)，了解如何提交Pull Request、报告bug和建议改进。

## 许可证

PerfMan是根据[MIT许可证](LICENSE)开源的软件。

## 致谢

- 感谢Spring Cloud提供微服务架构支持。
- 感谢Eureka实现服务发现。
- 感谢Spring Cloud Gateway管理API网关。
- 感谢所有PerfMan项目的贡献者和支持者。
