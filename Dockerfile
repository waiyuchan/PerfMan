FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY studio/go.mod studio/go.sum ./
RUN go mod download
COPY studio/ ./
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/perfman ./cmd/perfman

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && useradd -u 10001 -m perfman && mkdir -p /var/lib/perfman && chown perfman:perfman /var/lib/perfman
COPY --from=build /out/perfman /usr/local/bin/perfman
USER perfman
ENV PERFMAN_ADDR=0.0.0.0:8099 PERFMAN_DATA=/var/lib/perfman/workspace.db
VOLUME ["/var/lib/perfman"]
EXPOSE 8099
HEALTHCHECK --interval=15s --timeout=3s CMD curl -fsS http://127.0.0.1:8099/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/perfman"]
