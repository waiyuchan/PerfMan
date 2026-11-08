package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Histogram buckets are 1 ms upper bounds through the 3s request timeout.
// Merge bucket COUNTS before computing a quantile; never average percentiles.
type histogram struct {
	B         [10001]int
	N, Errors int
	Sum       float64
}

func (h *histogram) add(ms float64, failed bool) {
	i := int(math.Ceil(ms))
	if i > 10000 {
		i = 10000
	}
	if i < 0 {
		i = 0
	}
	h.B[i]++
	h.N++
	h.Sum += ms
	if failed {
		h.Errors++
	}
}
func (h *histogram) q(p float64) float64 {
	if h.N == 0 {
		return 0
	}
	target := int(math.Ceil(float64(h.N) * p))
	n := 0
	for i, c := range h.B {
		n += c
		if n >= target {
			return float64(i)
		}
	}
	return 10000
}
func (h *histogram) rate() float64 {
	if h.N == 0 {
		return 0
	}
	return 100 * float64(h.Errors) / float64(h.N)
}
func (h *histogram) mean() float64 {
	if h.N == 0 {
		return 0
	}
	return h.Sum / float64(h.N)
}

type accumulator struct {
	mu           sync.Mutex
	all, window  histogram
	endpoints    map[string]*histogram
	samples      []Sample
	tx, failedTx int
}

func (ac *accumulator) record(name string, status int, ms float64, problem string) {
	ac.mu.Lock()
	defer ac.mu.Unlock()
	ac.all.add(ms, problem != "")
	ac.window.add(ms, problem != "")
	h := ac.endpoints[name]
	if h == nil {
		h = &histogram{}
		ac.endpoints[name] = h
	}
	h.add(ms, problem != "")
	if problem != "" || len(ac.samples) < 6 {
		ac.samples = append(ac.samples, Sample{name, status, math.Round(ms*100) / 100, problem})
		if len(ac.samples) > 30 {
			ac.samples = ac.samples[1:]
		}
	}
}
func (ac *accumulator) transaction(failed bool) {
	ac.mu.Lock()
	defer ac.mu.Unlock()
	ac.tx++
	if failed {
		ac.failedTx++
	}
}
func (ac *accumulator) snapshot(elapsed float64) (Metrics, histogram, []Endpoint, []Sample) {
	ac.mu.Lock()
	defer ac.mu.Unlock()
	h := ac.all
	m := Metrics{Requests: h.N, Errors: h.Errors, Transactions: ac.tx, FailedTransactions: ac.failedTx, RPS: float64(h.N) / math.Max(elapsed, .001), P50: h.q(.5), P95: h.q(.95), P99: h.q(.99), Mean: h.mean(), ErrorRate: h.rate()}
	w := ac.window
	ac.window = histogram{}
	ends := []Endpoint{}
	for name, h := range ac.endpoints {
		ends = append(ends, Endpoint{name, h.N, h.Errors, h.q(.95), h.mean()})
	}
	sort.Slice(ends, func(i, j int) bool { return ends[i].Name < ends[j].Name })
	return m, w, ends, append([]Sample{}, ac.samples...)
}
func targetVU(s Scenario, elapsed float64) int {
	if s.Mode == "constant" {
		return s.VUs
	}
	fraction := elapsed / float64(s.Duration)
	if fraction < .25 {
		return max(1, s.VUs/4)
	}
	if fraction < .5 {
		return max(1, s.VUs/2)
	}
	return s.VUs
}
func expand(s string, vars map[string]string) string {
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

func (a *App) execute(ctx context.Context, r *Run) {
	defer a.jobs.Done()
	s := r.Scenario
	start := time.Now()
	ac := &accumulator{endpoints: map[string]*histogram{}}
	deadline, cancel := context.WithTimeout(ctx, time.Duration(s.Duration)*time.Second)
	defer cancel()
	transport := &http.Transport{MaxIdleConns: 40, MaxIdleConnsPerHost: 20, DisableCompression: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 3 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	var workers sync.WaitGroup
	for vu := 0; vu < s.VUs; vu++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			for deadline.Err() == nil {
				if index >= targetVU(s, time.Since(start).Seconds()) {
					select {
					case <-deadline.Done():
						return
					case <-time.After(50 * time.Millisecond):
					}
					continue
				}
				vars := map[string]string{}
				failed := false
				completed := true
				for _, st := range s.Steps {
					if deadline.Err() != nil {
						completed = false
						break
					}
					t := time.Now()
					req, err := http.NewRequestWithContext(deadline, st.Method, a.base+expand(st.Path, vars), strings.NewReader(expand(st.Body, vars)))
					status := 0
					problem := ""
					var body []byte
					if err == nil {
						req.Header.Set("Content-Type", "application/json")
						req.Header.Set("X-Demo-Profile", s.Profile)
						for k, v := range st.Headers {
							req.Header.Set(k, expand(v, vars))
						}
						var resp *http.Response
						resp, err = client.Do(req)
						if err == nil {
							status = resp.StatusCode
							body, err = io.ReadAll(io.LimitReader(resp.Body, 65536))
							resp.Body.Close()
						}
					}
					if deadline.Err() != nil {
						completed = false
						break
					}
					if err != nil {
						problem = "请求失败或超时"
					} else if status != st.Expect {
						problem = fmt.Sprintf("断言失败：预期 %d，实际 %d", st.Expect, status)
					} else if st.Extract != "" {
						var payload map[string]any
						if json.Unmarshal(body, &payload) != nil {
							problem = "提取失败：响应不是 JSON"
						} else if v, ok := payload[st.Extract]; !ok {
							problem = "提取失败：字段 " + st.Extract + " 不存在"
						} else {
							vars[st.Extract] = fmt.Sprint(v)
						}
					}
					ac.record(st.Name, status, time.Since(t).Seconds()*1000, problem)
					if problem != "" {
						failed = true
						break
					}
				}
				if completed {
					ac.transaction(failed)
				}
				if r.Kind == "debug" {
					return
				}
				select {
				case <-deadline.Done():
					return
				case <-time.After(time.Duration(s.ThinkMS) * time.Millisecond):
				}
			}
		}(vu)
	}
	done := make(chan struct{})
	go func() { workers.Wait(); close(done) }()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	strikes := 0
	protected := false
	last := start
	update := func(final bool) {
		elapsed := time.Since(start).Seconds()
		metrics, w, ends, samples := ac.snapshot(elapsed)
		a.mu.Lock()
		defer a.mu.Unlock()
		r.Metrics = metrics
		r.Elapsed = elapsed
		r.Endpoints = ends
		r.Samples = samples
		if w.N > 0 || !final {
			r.Points = append(r.Points, Point{Second: math.Round(elapsed*1000) / 1000, RPS: float64(w.N) / math.Max(time.Since(last).Seconds(), .001), P95: w.q(.95), ErrorRate: w.rate(), VUs: targetVU(s, elapsed), Requests: w.N})
		}
		last = time.Now()
		if !final && r.Kind != "debug" && elapsed >= 2 && w.N >= 5 && s.Protect {
			if w.q(.95) > s.P95Limit || w.rate() > s.ErrorLimit {
				strikes++
			} else {
				strikes = 0
			}
			if strikes >= 3 && !protected {
				protected = true
				r.Events = append(r.Events, Event{now(), "warning", "连续 3 个有效窗口超过 SLA，已触发自动停止"})
				cancel()
			}
		}
	}
	for {
		select {
		case <-ticker.C:
			update(false)
		case <-done:
			update(true)
			a.mu.Lock()
			r.FinishedAt = now()
			r.Status = "completed"
			r.Verdict = "passed"
			if r.Metrics.Requests == 0 {
				r.Verdict = "no_data"
			} else if r.Metrics.P95 > s.P95Limit || r.Metrics.ErrorRate > s.ErrorLimit {
				r.Verdict = "failed"
			}
			if protected {
				r.Status = "protected"
				r.Verdict = "failed"
			} else if ctx.Err() != nil {
				r.Status = "stopped"
				r.Verdict = "incomplete"
			}
			r.Events = append(r.Events, Event{now(), "info", fmt.Sprintf("执行结束：%d 个请求，%d 个完整事务", r.Metrics.Requests, r.Metrics.Transactions)})
			delete(a.active, r.ID)
			a.state.Revision++
			if err := a.saveLocked(); err != nil {
				r.Events = append(r.Events, Event{now(), "error", "结果持久化失败，请立即导出报告"})
			}
			a.mu.Unlock()
			return
		}
	}
}
