package studio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
type Step struct {
	Name    string            `json:"name"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Body    string            `json:"body"`
	Headers map[string]string `json:"headers"`
	Expect  int               `json:"expect"`
	Extract string            `json:"extract"`
}
type Scenario struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"projectId"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Version     int     `json:"version"`
	Mode        string  `json:"mode"`
	VUs         int     `json:"vus"`
	Duration    int     `json:"duration"`
	ThinkMS     int     `json:"thinkMs"`
	P95Limit    float64 `json:"p95Limit"`
	ErrorLimit  float64 `json:"errorLimit"`
	Protect     bool    `json:"protect"`
	Profile     string  `json:"profile"`
	Steps       []Step  `json:"steps"`
}
type Metrics struct {
	Requests           int     `json:"requests"`
	Errors             int     `json:"errors"`
	Transactions       int     `json:"transactions"`
	FailedTransactions int     `json:"failedTransactions"`
	RPS                float64 `json:"rps"`
	P50                float64 `json:"p50"`
	P95                float64 `json:"p95"`
	P99                float64 `json:"p99"`
	Mean               float64 `json:"mean"`
	ErrorRate          float64 `json:"errorRate"`
}
type Point struct {
	Second    float64 `json:"second"`
	RPS       float64 `json:"rps"`
	P95       float64 `json:"p95"`
	ErrorRate float64 `json:"errorRate"`
	VUs       int     `json:"vus"`
	Requests  int     `json:"requests"`
}
type Endpoint struct {
	Name     string  `json:"name"`
	Requests int     `json:"requests"`
	Errors   int     `json:"errors"`
	P95      float64 `json:"p95"`
	Mean     float64 `json:"mean"`
}
type Event struct {
	At      string `json:"at"`
	Level   string `json:"level"`
	Message string `json:"message"`
}
type Sample struct {
	Step   string  `json:"step"`
	Status int     `json:"status"`
	MS     float64 `json:"ms"`
	Error  string  `json:"error"`
}
type Run struct {
	ID         string     `json:"id"`
	Scenario   Scenario   `json:"scenario"`
	Kind       string     `json:"kind"`
	Status     string     `json:"status"`
	Verdict    string     `json:"verdict"`
	Source     string     `json:"source"`
	StartedAt  string     `json:"startedAt"`
	FinishedAt string     `json:"finishedAt"`
	Elapsed    float64    `json:"elapsed"`
	Metrics    Metrics    `json:"metrics"`
	Points     []Point    `json:"points"`
	Endpoints  []Endpoint `json:"endpoints"`
	Events     []Event    `json:"events"`
	Samples    []Sample   `json:"samples"`
}
type State struct {
	Revision  int        `json:"revision"`
	Projects  []Project  `json:"projects"`
	Scenarios []Scenario `json:"scenarios"`
	Runs      []*Run     `json:"runs"`
}
type App struct {
	mu         sync.Mutex
	state      State
	path, base string
	active     map[string]context.CancelFunc
	jobs       sync.WaitGroup
	closing    bool
}

func New(path, base string) (*App, error) {
	a := &App{path: path, base: base, active: map[string]context.CancelFunc{}}
	if b, err := os.ReadFile(path); err == nil {
		if err = json.Unmarshal(b, &a.state); err != nil {
			return nil, fmt.Errorf("invalid state: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	} else {
		a.state = seed()
	}
	for _, r := range a.state.Runs {
		if r.Status == "running" || r.Status == "stopping" {
			r.Status = "interrupted"
			r.Verdict = "incomplete"
			r.FinishedAt = now()
			r.Events = append(r.Events, Event{now(), "warning", "服务重启；任务未续跑，结果不完整"})
		}
	}
	if err := a.saveLocked(); err != nil {
		return nil, err
	}
	return a, nil
}
func now() string             { return time.Now().UTC().Format(time.RFC3339Nano) }
func id(prefix string) string { return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano()) }
func clone[T any](v T) T      { b, _ := json.Marshal(v); var out T; json.Unmarshal(b, &out); return out }
func (a *App) Close() {
	a.mu.Lock()
	a.closing = true
	for _, cancel := range a.active {
		cancel()
	}
	a.mu.Unlock()
	a.jobs.Wait()
}
func (a *App) saveLocked() error {
	if a.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(a.path), 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(a.state, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(a.path), ".perfman-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), a.path)
}
func valid(s Scenario) error {
	if len(strings.TrimSpace(s.Name)) == 0 || len(s.Name) > 120 {
		return errors.New("场景名称需为 1–120 个字节")
	}
	if s.VUs < 1 || s.VUs > 20 || s.Duration < 3 || s.Duration > 120 || s.ThinkMS < 50 || s.ThinkMS > 5000 {
		return errors.New("演示上限：1–20 VU、3–120 秒、50–5000 ms 思考时间")
	}
	if s.Mode != "constant" && s.Mode != "ramp" {
		return errors.New("请选择恒定或阶梯 VU 模型")
	}
	if s.Profile != "healthy" && s.Profile != "bottleneck" {
		return errors.New("未知演示环境")
	}
	if math.IsNaN(s.P95Limit) || math.IsInf(s.P95Limit, 0) || s.P95Limit < 1 || s.P95Limit > 10000 || s.ErrorLimit < 0 || s.ErrorLimit > 100 {
		return errors.New("SLA 范围：P95 1–10000 ms，错误率 0–100%")
	}
	if len(s.Steps) == 0 || len(s.Steps) > 8 {
		return errors.New("场景必须包含 1–8 个请求")
	}
	names := map[string]bool{}
	for _, st := range s.Steps {
		if st.Name == "" || len(st.Name) > 80 || names[st.Name] {
			return errors.New("请求名称不能为空或重复，最长 80 字节")
		}
		names[st.Name] = true
		if st.Method != "GET" && st.Method != "POST" {
			return errors.New("内置执行器支持 GET 和 POST")
		}
		u, err := url.Parse(st.Path)
		if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/demo-api/") || strings.Contains(u.Path, "..") || u.Fragment != "" {
			return errors.New("本地演示只允许 /demo-api/ 下的相对路径")
		}
		if st.Expect < 100 || st.Expect > 599 || len(st.Body) > 4096 {
			return errors.New("状态码或请求体不合法")
		}
		for k, v := range st.Headers {
			if len(k) > 80 || len(v) > 2048 || strings.ContainsAny(k+v, "\r\n") {
				return errors.New("请求头格式不合法")
			}
		}
	}
	return nil
}
func seed() State {
	steps := []Step{{Name: "登录获取令牌", Method: "POST", Path: "/demo-api/login", Body: `{"username":"demo"}`, Expect: 200, Extract: "token", Headers: map[string]string{}}, {Name: "浏览商品", Method: "GET", Path: "/demo-api/products", Expect: 200, Headers: map[string]string{"Authorization": "Bearer {{token}}"}}, {Name: "提交订单", Method: "POST", Path: "/demo-api/checkout", Body: `{"sku":"desk-01","quantity":1}`, Expect: 201, Headers: map[string]string{"Authorization": "Bearer {{token}}"}}}
	return State{Revision: 1, Projects: []Project{{"commerce", "Commerce API", "电商核心链路的性能回归"}, {"platform", "Platform services", "基础服务与接口基准"}}, Scenarios: []Scenario{
		{ID: "checkout", ProjectID: "commerce", Name: "商城下单链路", Description: "登录、浏览商品、提交订单，验证完整业务事务。", Version: 1, Mode: "ramp", VUs: 8, Duration: 20, ThinkMS: 200, P95Limit: 300, ErrorLimit: 1, Protect: true, Profile: "healthy", Steps: steps},
		{ID: "bottleneck", ProjectID: "commerce", Name: "订单服务瓶颈复现", Description: "使用内置慢响应与错误，验证 SLA 保护和定位。", Version: 1, Mode: "constant", VUs: 8, Duration: 25, ThinkMS: 150, P95Limit: 250, ErrorLimit: 1, Protect: true, Profile: "bottleneck", Steps: clone(steps)},
		{ID: "catalog", ProjectID: "platform", Name: "商品接口基准", Description: "单接口恒定并发，建立可重复的性能基线。", Version: 1, Mode: "constant", VUs: 4, Duration: 15, ThinkMS: 200, P95Limit: 200, ErrorLimit: 1, Protect: true, Profile: "healthy", Steps: []Step{{Name: "商品查询", Method: "GET", Path: "/demo-api/products", Expect: 200, Headers: map[string]string{}}}},
	}, Runs: []*Run{}}
}
