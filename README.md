<div align="center">
    <img src="resources/img/logo_with_name.png" height="100px"/>
    <h1>PerfMan: Performance Testing Management Platform</h1>
</div>

<div align="center">
    <img src="https://img.shields.io/badge/Language-Java-orange.svg" />
    <img src="https://img.shields.io/badge/ORM-MyBatis-blue.svg" />
    <img src="https://img.shields.io/badge/Architecture-Spring Cloud-6db33f.svg" />
</div>

<h4 align="center">
    <a href="README.zh.md">中文</a> | English
</h4>

PerfMan is an open-source, comprehensive performance testing management platform designed for modern cloud applications.
It
provides a suite of tools for managing environments, projects, testing scenarios, tasks, and notifications, all built on
a microservices architecture leveraging Spring Cloud.

## Features

- **Service Discovery**: Centralized service registry and discovery using Eureka.
- **API Gateway**: Unified entry point for microservices using Spring Cloud Gateway.
- **Configuration Management**: Centralized configuration management with Spring Cloud Config.
- **Identity and Access Management**: User registration, authentication, and authorization.
- **Notification Service**: In-app and email notifications.
- **Environment and Resource Management**: Manage nodes, clusters, and monitor resources.
- **Project Management**: Project creation, member management, and search functionalities.
- **Test Management**: Create, manage, and execute testing scenarios and tasks.
- **Alerting Service**: Configurable alert rules and notification settings.

## Getting Started

### Prerequisites

- JDK 8 or later
- Maven 3.8 or later

### Installation

Clone the PerfMan repository:

```bash
git clone https://github.com/waiyuchan/PerfMan.git
cd perfman
```

Build the project with Maven:

```bash
mvn clean install
```

## Configuration Center Update Guide

### Introduction

This guide describes how to update the configuration center configuration of the PerfMan project by updating the
configuration files in the Git repository. The configuration center uses Spring Cloud Config Server to pull
configuration files from the Git repository and provide them to each microservice.

### Steps

#### 1. Clone the configuration repository

First, clone the configuration repository to your local machine:

```bash
git clone https://github.com/waiyuchan/perfman-config-repo.git
cd perfman-config-repo
```

### 2. Update the configuration file

In the cloned repository, find the configuration file that needs to be updated, such as `application.yml` or the
configuration file for a specific service (such as `perfman-project-service.yml`).

#### Operation example:

Update `application.yml` file:

```yaml
# application.yml
spring:
  application:
    name: perfman-config-service
    # Add or modify configuration items
    new-property: newValue
```

Update `perfman-project-service.yml` file:

```yaml
# perfman-project-service.yml
project:
  setting1: newValue1
  setting2: newValue2
```

### 3. Commit and push changes

Commit the changes to the Git repository:

```bash
git add .
git commit -m "Update configuration for perfman-project-service"
git push origin master
```

### 4. Refresh configuration

In order for the changes to take effect, you need to notify the configuration center to refresh the configuration. This
can be achieved in the following two ways:

#### Method 1: Refresh using Spring Boot Actuator endpoint

If the client application has Spring Boot Actuator enabled, you can access the `/actuator/refresh` endpoint to refresh
the configuration.

```bash
curl -X POST http://localhost:8080/actuator/refresh
```

#### Method 2: Manually restart the client application

Manually restart the client application that needs to update the configuration so that it can pull the latest
configuration from the configuration center again.

### Frequently Asked Questions

#### Problem 1: Configuration does not take effect

Make sure that the changes have been pushed to the Git repository and the client application has been refreshed or
restarted.

#### Problem 2: Configuration pull failed

Check whether the Git repository configuration in the `application.yml` file in the configuration center is correct:

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

Make sure the URL of the Git repository is correct and the repository contains the required configuration files.

## New service registration and discovery based on Eureka

### Steps

#### 1. Add Eureka Client dependency

Add Spring Cloud Netflix Eureka Client dependency in the service's `pom.xml` file:

```xml

<dependencies>
    <!-- Other dependencies -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
    </dependency>
</dependencies>
```

#### 2. Configure `application.yml`

Add Eureka client configuration in the service's `src/main/resources/application.yml` file:

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

#### 3. Enable Eureka client

Enable Eureka client in the main class file of the service. Assume the main class file
is `PerfmanServiceApplication.java`:

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

#### 4. Start the service

To start the service, follow these steps:

1. Make sure `perfman-discovery-service` is up and running at `http://localhost:8761`.

2. Start the new service, which will automatically register with Eureka when it starts.

#### 5. Verify service registration

Visit `http://localhost:8761` in the browser to see all services registered with Eureka, including the new service.

#### 6. Configure other services to call the new service

Other services can call the newly registered service by service name to ensure that all services can discover each
other. Here is an example:

```yaml
# application.yml configuration for other services
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

Use `RestTemplate` to call the new service in the code:

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

#### FAQ

##### Problem 1: Service is not registered with Eureka

- Make sure the Eureka client is correctly configured in the service's `application.yml` file.

- Make sure the Eureka server (perfman-discovery-service) is up and running at the specified address.

##### Problem 2: Service cannot discover other services

- Make sure all services are correctly registered with Eureka and that the Eureka server is running properly.
- Check that the service name is correct and that the service name is consistent with the name registered in Eureka.

### Running the Services

Start the Eureka Server:

```bash
cd perfman-discovery-service
mvn spring-boot:run
```

Repeat the above step for each service, replacing `perfman-discovery-service` with the service directory you wish to
start.

## How to automatically generate database Model and Mapper

This project uses MyBatis Generator (MBG) to automatically generate Model and Mapper files corresponding to database
tables. The following are specific steps for each microservice:

### Prerequisites

1. Make sure Maven is installed.
2. Make sure the MySQL database is started and the relevant table structure has been created.
3. Make sure the configuration center (`perfman-config-service`) is running normally and the database connection
   information has been configured.

### General steps

1. **Add MyBatis Generator dependency in `pom.xml`**

```xml
<dependencies>
    <dependency>
        <groupId>org.mybatis.spring.boot</groupId>
        <artifactId>mybatis-spring-boot-starter</artifactId>
        <version>2.1.4</version>
    </dependency>
    <dependency>
        <groupId>mysql</groupId>
        <artifactId>mysql-connector-java</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>org.mybatis.generator</groupId>
        <artifactId>mybatis-generator-core</artifactId>
        <version>1.4.0</version>
    </dependency>
</dependencies>

<build>
<plugins>
    <plugin>
        <groupId>org.mybatis.generator</groupId>
        <artifactId>mybatis-generator-maven-plugin</artifactId>
        <version>1.4.0</version>
        <configuration>
            <verbose>true</verbose>
            <overwrite>true</overwrite>
        </configuration>
        <executions>
            <execution>
                <id>Generate MyBatis Artifacts</id>
                <goals>
                    <goal>generate</goal>
                </goals>
            </execution>
        </executions>
    </plugin>
</plugins>
</build>
```

2. **Create the `generatorConfig.xml` file in the `src/main/resources` directory**

Take `perfman-auth-service` as an example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE generatorConfiguration PUBLIC "-//mybatis.org//DTD MyBatis Generator Configuration 1.0//EN"
        "http://mybatis.org/dtd/mybatis-generator-config_1_0.dtd">
<generatorConfiguration>
    <context id="MySQLTables" targetRuntime="MyBatis3">
        <commentGenerator>
            <property name="suppressAllComments" value="true"/>
        </commentGenerator>

        <jdbcConnection driverClass="com.mysql.cj.jdbc.Driver"
                        connectionURL="jdbc:mysql://localhost:3306/perfman"
                        userId="root"
                        password="Test123456"/>

        <javaTypeResolver>
            <property name="forceBigDecimals" value="false"/>
        </javaTypeResolver>

        <javaModelGenerator targetPackage="com.code4faster.perfmanauthservice.model" targetProject="src/main/java"/>
        <sqlMapGenerator targetPackage="mapper" targetProject="src/main/resources"/>
        <javaClientGenerator type="XMLMAPPER" targetPackage="com.code4faster.perfmanauthservice.mapper"
                             targetProject="src/main/java"/>

        <table tableName="users" domainObjectName="User"/>
        <table tableName="roles" domainObjectName="Role"/>
        <table tableName="permissions" domainObjectName="Permission"/>
        <table tableName="user_roles" domainObjectName="UserRole"/>
        <table tableName="role_permissions" domainObjectName="RolePermission"/>
        <table tableName="user_tokens" domainObjectName="UserToken"/>
    </context>
</generatorConfiguration>
```

Change `targetPackage` and table name according to different microservices.

3. **Run MyBatis Generator in the command line**

```bash
mvn mybatis-generator:generate
```

### Configuration examples for each microservice

#### perfman-auth-service

Directory structure:

```
perfman-auth-service
│
└─src
    ├─main
    │  ├─java
    │  │  └─com
    │  │      └─code4faster
    │  │          └─perfmanauthservice
    │  │              │  PerfmanAuthServiceApplication.java
    │  │              │
    │  │              ├─model
    │  │              │      User.java
    │  │              │      Role.java
    │  │              │      Permission.java
    │  │              │      UserRole.java
    │  │              │      RolePermission.java
    │  │              │      UserToken.java
    │  │              │
    │  │              ├─mapper
    │  │              │      UserMapper.java
    │  │              │      RoleMapper.java
    │  │              │      PermissionMapper.java
    │  │              │      UserRoleMapper.java
    │  │              │      RolePermissionMapper.java
    │  │              │      UserTokenMapper.java
    │  │              │
    │  │              ├─service
    │  │              │      UserService.java
    │  │              │      RoleService.java
    │  │              │      PermissionService.java
    │  │              │      UserRoleService.java
    │  │              │      RolePermissionService.java
    │  │              │      UserTokenService.java
    │  │              │
    │  │              └─controller
    │  │                     AuthController.java
    │  │                     # Other controllers
    │  └─resources
    │      │  application.yml
    │      │  generatorConfig.xml
    │      └─mapper
    │              UserMapper.xml
    │              RoleMapper.xml
    │              PermissionMapper.xml
    │              UserRoleMapper.xml
    │              RolePermissionMapper.xml
    │              UserTokenMapper.xml
```

#### perfman-project-service

1. **Configure `generatorConfig.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE generatorConfiguration PUBLIC "-//mybatis.org//DTD MyBatis Generator Configuration 1.0//EN"
        "http://mybatis.org/dtd/mybatis-generator-config_1_0.dtd">
<generatorConfiguration>
    <context id="MySQLTables" targetRuntime="MyBatis3">
        <commentGenerator>
            <property name="suppressAllComments" value="true"/>
        </commentGenerator>

        <jdbcConnection driverClass="com.mysql.cj.jdbc.Driver"
                        connectionURL="jdbc:mysql://localhost:3306/perfman"
                        userId="root"
                        password="Test123456"/>

        <javaTypeResolver>
            <property name="forceBigDecimals" value="false"/>
        </javaTypeResolver>

        <javaModelGenerator targetPackage="com.code4faster.perfmanprojectservice.model" targetProject="src/main/java"/>
        <sqlMapGenerator targetPackage="mapper" targetProject="src/main/resources"/>
        <javaClientGenerator type="XMLMAPPER" targetPackage="com.code4faster.perfmanprojectservice.mapper"
                             targetProject="src/main/java"/>

        <table tableName="projects" domainObjectName="Project"/>
        <table tableName="project_members" domainObjectName="ProjectMember"/>
        <table tableName="project_invitations" domainObjectName="ProjectInvitation"/>
    </context>
</generatorConfiguration>
```

2. **Generate Model and Mapper**

```bash
mvn mybatis-generator:generate
```

Directory structure:

```
perfman-project-service
│
└─src
    ├─main
    │  ├─java
    │  │  └─com
    │  │      └─code4faster
    │  │          └─perfmanprojectservice
    │  │              │  PerfmanProjectServiceApplication.java
    │  │              │
    │  │              ├─model
    │  │              │      Project.java
    │  │              │      ProjectMember.java
    │  │              │      ProjectInvitation.java
    │  │              │
    │  │              ├─mapper
    │  │              │      ProjectMapper.java
    │  │              │      ProjectMemberMapper.java
    │  │              │      ProjectInvitationMapper.java
    │  │              │
    │  │              ├─service
    │  │              │      ProjectService.java
    │  │              │      ProjectMemberService.java
    │  │              │      ProjectInvitationService.java
    │  │              │
    │  │              └─controller
    │  │                     ProjectController.java
    │  │                     # Other controllers
    │  └─resources
    │      │  application.yml
    │      │  generatorConfig.xml
    │      └─mapper
    │              ProjectMapper.xml
    │              ProjectMemberMapper.xml
    │              ProjectInvitationMapper.xml
```

### Other microservices

Follow the above example, create `generatorConfig.xml` for other microservices, adjust

`targetPackage` and table name, and then run MyBatis Generator to generate the corresponding Model and Mapper files.

## Documentation

For more detailed documentation, visit [Wiki Page](https://github.com/yourusername/perfman/wiki).

## Contributing

We welcome contributions to PerfMan! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit
pull requests, the
process for submitting bugs, and how to suggest improvements.

## License

PerfMan is open-source software licensed under the [Apache-2.0 license](LICENSE).

## Acknowledgments

- Spring Cloud for the microservices architecture support.
- Eureka for service discovery.
- Spring Cloud Gateway for API gateway management.
- All contributors and supporters of the PerfMan project.