package studio

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testApp(t *testing.T) (*App, *httptest.Server) {
	t.Helper()
	a, err := New(filepath.Join(t.TempDir(), "state.json"), "")
	if err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(a.Handler())
	a.base = s.URL
	t.Cleanup(func() { a.Close(); s.Close() })
	return a, s
}
func post(t *testing.T, s *httptest.Server, path string, v any) (int, []byte) {
	t.Helper()
	b, _ := json.Marshal(v)
	resp, err := http.Post(s.URL+"/api/"+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}
func waitRun(t *testing.T, a *App, id string) *Run {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		a.mu.Lock()
		for _, r := range a.state.Runs {
			if r.ID == id && r.Status != "running" && r.Status != "stopping" {
				out := clone(r)
				a.mu.Unlock()
				return out
			}
		}
		a.mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("task did not terminate")
	return nil
}
func startRun(t *testing.T, s *httptest.Server, scenario, kind string) *Run {
	t.Helper()
	code, b := post(t, s, "runs", map[string]string{"scenarioId": scenario, "kind": kind})
	if code != 201 {
		t.Fatalf("start: %d %s", code, b)
	}
	var r Run
	json.Unmarshal(b, &r)
	return &r
}
func TestHistogramWeightedQuantiles(t *testing.T) {
	var h histogram
	for i := 0; i < 99; i++ {
		h.add(10.2, false)
	}
	h.add(900, true)
	if h.q(.95) != 11 || h.q(1) != 900 || h.rate() != 1 {
		t.Fatalf("bad histogram %+v", h)
	}
	if new(histogram).q(.95) != 0 {
		t.Fatal("empty percentile")
	}
}
func TestDebugChainAndFrozenSnapshot(t *testing.T) {
	a, s := testApp(t)
	r := startRun(t, s, "checkout", "debug")
	done := waitRun(t, a, r.ID)
	if done.Metrics.Requests != 3 || done.Metrics.Transactions != 1 || done.Metrics.Errors != 0 || done.Verdict != "passed" {
		t.Fatalf("debug chain failed: %+v", done)
	}
	updated := clone(a.state.Scenarios[0])
	updated.Name = "Changed after execution"
	code, _ := post(t, s, "scenarios", updated)
	if code != 200 {
		t.Fatal(code)
	}
	if a.state.Runs[0].Scenario.Name == updated.Name {
		t.Fatal("run snapshot was mutated")
	}
	code, _ = post(t, s, "scenarios", updated)
	if code != 409 {
		t.Fatalf("stale revision accepted: %d", code)
	}
	restored, err := New(a.path, a.base)
	if err != nil {
		t.Fatal(err)
	}
	if restored.state.Runs[0].Metrics.Requests != 3 {
		t.Fatal("result did not survive restart")
	}
	restored.Close()
}
func TestManualStopAndAdmission(t *testing.T) {
	a, s := testApp(t)
	r := startRun(t, s, "checkout", "load")
	code, _ := post(t, s, "runs", map[string]string{"scenarioId": "checkout", "kind": "load"})
	if code != 409 {
		t.Fatal("parallel admission allowed")
	}
	post(t, s, "runs/"+r.ID+"/stop", map[string]any{})
	done := waitRun(t, a, r.ID)
	if done.Status != "stopped" || done.Verdict != "incomplete" {
		t.Fatalf("invalid stopped verdict: %+v", done)
	}
	a.mu.Lock()
	count := len(a.active)
	a.mu.Unlock()
	if count != 0 {
		t.Fatal("execution slot leaked")
	}
}
func TestSLAProtectionUsesRealWindows(t *testing.T) {
	a, s := testApp(t)
	r := startRun(t, s, "bottleneck", "load")
	done := waitRun(t, a, r.ID)
	if done.Status != "protected" || done.Verdict != "failed" || done.Elapsed < 3 || done.Elapsed > 8 || done.Metrics.Errors == 0 {
		t.Fatalf("SLA not applied: status=%s verdict=%s elapsed=%f errors=%d", done.Status, done.Verdict, done.Elapsed, done.Metrics.Errors)
	}
}
func TestRestartMarksActiveIncomplete(t *testing.T) {
	file := filepath.Join(t.TempDir(), "state.json")
	st := seed()
	st.Runs = []*Run{{ID: "interrupted", Status: "running", Verdict: "pending"}}
	b, _ := json.Marshal(st)
	os.WriteFile(file, b, 0600)
	a, err := New(file, "")
	if err != nil {
		t.Fatal(err)
	}
	if a.state.Runs[0].Status != "interrupted" || a.state.Runs[0].Verdict != "incomplete" {
		t.Fatal("restart silently passed")
	}
	a.Close()
}
func TestInvalidRequestsAndOrigins(t *testing.T) {
	_, s := testApp(t)
	bad := seed().Scenarios[0]
	for _, path := range []string{"https://example.com", "//example.com/demo-api/a", "/demo-api/../api/state", "/api/state"} {
		bad.Steps[0].Path = path
		code, _ := post(t, s, "scenarios", bad)
		if code != 400 {
			t.Errorf("accepted %s", path)
		}
	}
	req, _ := http.NewRequest("POST", s.URL+"/api/runs", strings.NewReader(`{"scenarioId":"checkout","kind":"load"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://unrelated.invalid")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("foreign origin accepted")
	}
	for _, body := range []string{`{} {}`, `{} trailing`, `{"unknown":1}`} {
		res, err := http.Post(s.URL+"/api/runs", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 400 {
			t.Errorf("accepted invalid body: %s", body)
		}
	}
}
func TestPersistenceFailureDoesNotStart(t *testing.T) {
	a, s := testApp(t)
	a.mu.Lock()
	a.path = filepath.Join(t.TempDir(), "blocking", "state.json")
	os.WriteFile(filepath.Dir(a.path), []byte("file"), 0600)
	a.mu.Unlock()
	code, _ := post(t, s, "runs", map[string]string{"scenarioId": "checkout", "kind": "load"})
	if code != 500 || len(a.active) != 0 || len(a.state.Runs) != 0 {
		t.Fatal("unpersisted job started")
	}
}
func TestCancelContextStopsTransport(t *testing.T) {
	a, _ := testApp(t)
	ctx, cancel := context.WithCancel(context.Background())
	r := &Run{ID: "direct", Scenario: seed().Scenarios[1], Kind: "load", Status: "running"}
	a.jobs.Add(1)
	a.mu.Lock()
	a.state.Runs = append(a.state.Runs, r)
	a.mu.Unlock()
	go a.execute(ctx, r)
	cancel()
	a.jobs.Wait()
	if r.Status != "stopped" {
		t.Fatal(r.Status)
	}
}
func TestCorruptStateFailsClosed(t *testing.T) {
	p := filepath.Join(t.TempDir(), "state.json")
	os.WriteFile(p, []byte(`{bad`), 0600)
	if _, err := New(p, ""); err == nil {
		t.Fatal("corrupt state silently overwritten")
	}
}
