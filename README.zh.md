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
git clone https://github.com/yourusername/perfman.git
cd perfman
```

使用Maven构建项目：

```bash
mvn clean install
```

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
