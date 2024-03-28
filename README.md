# PerfMan: Performance Management Platform

PerfMan is an open-source, comprehensive performance management platform designed for modern cloud applications. It
provides a suite of tools for managing environments, projects, testing scenarios, tasks, and notifications, all built on
a microservices architecture leveraging Spring Cloud.

**Chinese Version**: [中文](README.zh.md)

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

### Running the Services

Start the Eureka Server:

```bash
cd perfman-discovery-service
mvn spring-boot:run
```

Repeat the above step for each service, replacing `perfman-discovery-service` with the service directory you wish to
start.

## Documentation

For more detailed documentation, visit [Wiki Page](https://github.com/yourusername/perfman/wiki).

## Contributing

We welcome contributions to PerfMan! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests, the
process for submitting bugs, and how to suggest improvements.

## License

PerfMan is open-source software licensed under the [MIT license](LICENSE).

## Acknowledgments

- Spring Cloud for the microservices architecture support.
- Eureka for service discovery.
- Spring Cloud Gateway for API gateway management.
- All contributors and supporters of the PerfMan project.