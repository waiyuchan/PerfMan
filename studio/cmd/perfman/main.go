package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	studio "github.com/waiyuchan/PerfMan/studio"
)

func main() {
	addr := os.Getenv("PERFMAN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8099"
	}
	data := os.Getenv("PERFMAN_DATA")
	if data == "" {
		data = "data/workspace.db"
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	app, err := studio.NewWorkspace(data, "http://"+net.JoinHostPort("127.0.0.1", port))
	if err != nil {
		log.Fatal(err)
	}
	app.Start()
	server := &http.Server{Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		app.Close()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Printf("PerfMan: http://%s (data: %s)", listener.Addr(), data)
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
