package studio

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		problem(w, 400, "请求格式错误："+err.Error())
		return false
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		problem(w, 400, "请求只能包含一个 JSON 对象")
		return false
	}
	return true
}
func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	web, _ := fs.Sub(Assets, "web")
	mux.Handle("/", http.FileServer(http.FS(web)))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]string{"status": "ok", "service": "perfman-studio"})
	})
	mux.HandleFunc("/api/", a.api)
	var sequence atomic.Uint64
	mux.HandleFunc("/demo-api/", func(w http.ResponseWriter, r *http.Request) {
		n := sequence.Add(1)
		delay := 20 + int(n%7)*3
		status := 200
		var payload any = map[string]any{"products": []any{map[string]any{"sku": "desk-01", "name": "Studio desk", "price": 129}}}
		switch r.URL.Path {
		case "/demo-api/login":
			if r.Method != "POST" {
				problem(w, 405, "POST required")
				return
			}
			payload = map[string]string{"token": "demo-session-token"}
		case "/demo-api/products":
		case "/demo-api/checkout":
			if r.Method != "POST" {
				problem(w, 405, "POST required")
				return
			}
			if r.Header.Get("Authorization") != "Bearer demo-session-token" {
				problem(w, 401, "缺少登录令牌")
				return
			}
			status = 201
			delay = 55 + int(n%9)*4
			payload = map[string]string{"orderId": fmt.Sprintf("demo-%d", n)}
			if r.Header.Get("X-Demo-Profile") == "bottleneck" {
				delay = 360 + int(n%6)*45
				if n%5 == 0 {
					status = 503
					payload = map[string]string{"error": "演示：订单连接池耗尽"}
				}
			}
		default:
			problem(w, 404, "演示接口不存在")
			return
		}
		timer := time.NewTimer(time.Duration(delay) * time.Millisecond)
		defer timer.Stop()
		select {
		case <-r.Context().Done():
			return
		case <-timer.C:
		}
		reply(w, status, payload)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Cache-Control", "no-store")
		if strings.HasPrefix(r.URL.Path, "/api/") && r.Method != "GET" {
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Host != r.Host {
					problem(w, 403, "仅允许同源请求")
					return
				}
			}
			if r.Header.Get("Content-Type") != "application/json" {
				problem(w, 415, "请使用 application/json")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func (a *App) api(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	parts := strings.Split(path, "/")
	if r.Method == "GET" && path == "state" {
		a.mu.Lock()
		out := clone(a.state)
		a.mu.Unlock()
		reply(w, 200, out)
		return
	}
	if r.Method == "GET" && path == "capabilities" {
		reply(w, 200, map[string]any{"mode": "local", "engine": "native-http", "maxVUs": 20, "maxDuration": 120, "workers": 1, "distributed": false, "configSource": "environment + immutable run snapshot"})
		return
	}
	if r.Method == "POST" && path == "projects" {
		var p Project
		if !decode(w, r, &p) {
			return
		}
		p.Name = strings.TrimSpace(p.Name)
		if p.Name == "" || len(p.Name) > 80 || len(p.Description) > 500 {
			problem(w, 400, "项目名称 1–80 字节，说明最多 500 字节")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if len(a.state.Projects) >= 30 {
			problem(w, 409, "演示最多 30 个项目")
			return
		}
		before := a.state
		p.ID = id("project")
		a.state.Projects = append(append([]Project{}, a.state.Projects...), p)
		a.state.Revision++
		if err := a.saveLocked(); err != nil {
			a.state = before
			problem(w, 500, "保存失败")
			return
		}
		reply(w, 201, p)
		return
	}
	if r.Method == "POST" && path == "scenarios" {
		var s Scenario
		if !decode(w, r, &s) {
			return
		}
		if err := valid(s); err != nil {
			problem(w, 400, err.Error())
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		exists := false
		for _, p := range a.state.Projects {
			if p.ID == s.ProjectID {
				exists = true
			}
		}
		if !exists {
			problem(w, 400, "项目不存在")
			return
		}
		if len(a.state.Scenarios) >= 100 {
			problem(w, 409, "演示最多 100 个场景")
			return
		}
		before := a.state
		a.state.Scenarios = append([]Scenario{}, a.state.Scenarios...)
		if s.ID == "" {
			s.ID = id("scenario")
			s.Version = 1
			a.state.Scenarios = append(a.state.Scenarios, s)
		} else {
			found := false
			for i, old := range a.state.Scenarios {
				if old.ID == s.ID {
					if old.Version != s.Version {
						problem(w, 409, "场景已更新，请重新打开后编辑")
						return
					}
					s.Version++
					a.state.Scenarios[i] = s
					found = true
					break
				}
			}
			if !found {
				problem(w, 404, "场景不存在")
				return
			}
		}
		a.state.Revision++
		if err := a.saveLocked(); err != nil {
			a.state = before
			problem(w, 500, "保存失败")
			return
		}
		reply(w, 200, s)
		return
	}
	if r.Method == "POST" && path == "runs" {
		var input struct {
			ScenarioID string `json:"scenarioId"`
			Kind       string `json:"kind"`
		}
		if !decode(w, r, &input) {
			return
		}
		if input.Kind != "load" && input.Kind != "debug" {
			problem(w, 400, "任务类型需为 load 或 debug")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if a.closing {
			problem(w, 503, "服务正在关闭")
			return
		}
		if len(a.active) > 0 {
			problem(w, 409, "本地执行器忙，请先停止或等待当前任务")
			return
		}
		var s Scenario
		for _, v := range a.state.Scenarios {
			if v.ID == input.ScenarioID {
				s = clone(v)
			}
		}
		if s.ID == "" {
			problem(w, 404, "场景不存在")
			return
		}
		if err := valid(s); err != nil {
			problem(w, 400, err.Error())
			return
		}
		if input.Kind == "debug" {
			s.VUs = 1
			s.Mode = "constant"
			s.Protect = false
		}
		run := &Run{ID: id("run"), Scenario: s, Kind: input.Kind, Status: "running", Verdict: "pending", Source: "measured", StartedAt: now(), Points: []Point{}, Endpoints: []Endpoint{}, Samples: []Sample{}, Events: []Event{{now(), "info", "场景快照已冻结；内置 HTTP 执行器开始运行"}}}
		before := clone(a.state)
		a.state.Runs = append([]*Run{run}, a.state.Runs...)
		if len(a.state.Runs) > 200 {
			a.state.Runs = a.state.Runs[:200]
		}
		a.state.Revision++
		if err := a.saveLocked(); err != nil {
			a.state = before
			problem(w, 500, "任务未创建：存储不可写")
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		a.active[run.ID] = cancel
		a.jobs.Add(1)
		result := clone(run)
		go a.execute(ctx, run)
		reply(w, 201, result)
		return
	}
	if len(parts) >= 2 && parts[0] == "runs" {
		a.mu.Lock()
		defer a.mu.Unlock()
		var run *Run
		for _, v := range a.state.Runs {
			if v.ID == parts[1] {
				run = v
			}
		}
		if run == nil {
			problem(w, 404, "任务不存在")
			return
		}
		if r.Method == "POST" && len(parts) == 3 && parts[2] == "stop" {
			if cancel, ok := a.active[run.ID]; ok {
				run.Status = "stopping"
				run.Events = append(run.Events, Event{now(), "warning", "收到手动停止请求"})
				cancel()
			}
			reply(w, 200, run)
			return
		}
		if r.Method == "GET" && len(parts) == 3 && parts[2] == "csv" {
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			w.Header().Set("Content-Disposition", `attachment; filename="`+run.ID+`.csv"`)
			cw := csv.NewWriter(w)
			cw.Write([]string{"second", "requests", "rps", "p95_ms", "error_percent", "target_vus"})
			for _, p := range run.Points {
				cw.Write([]string{strconv.FormatFloat(p.Second, 'f', 3, 64), strconv.Itoa(p.Requests), fmt.Sprintf("%.3f", p.RPS), fmt.Sprint(p.P95), fmt.Sprintf("%.3f", p.ErrorRate), fmt.Sprint(p.VUs)})
			}
			cw.Flush()
			return
		}
		if r.Method == "GET" && len(parts) == 2 {
			reply(w, 200, run)
			return
		}
	}
	if r.Method == "GET" && len(parts) == 3 && parts[0] == "scenarios" && parts[2] == "k6" {
		a.mu.Lock()
		defer a.mu.Unlock()
		for _, s := range a.state.Scenarios {
			if s.ID == parts[1] {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
				w.Header().Set("Content-Disposition", `attachment; filename="perfman-`+s.ID+`.js"`)
				fmt.Fprint(w, exportK6(s))
				return
			}
		}
		problem(w, 404, "场景不存在")
		return
	}
	problem(w, 404, "接口不存在或方法不支持")
}
func exportK6(s Scenario) string {
	b, _ := json.MarshalIndent(s, "", "  ")
	return `// Exported by PerfMan. Requires an installed k6 binary. Not executed inside Studio.
// Set BASE_URL to an authorised target that implements the scenario paths.
import http from 'k6/http';
import { check, sleep } from 'k6';
const scenario = ` + string(b) + `;
export const options = {
 scenarios: { main: scenario.mode === 'constant' ? {executor:'constant-vus', vus:scenario.vus, duration:scenario.duration+'s'} : {executor:'ramping-vus', startVUs:Math.max(1,Math.floor(scenario.vus/4)), stages:[{duration:Math.max(1,Math.floor(scenario.duration/4))+'s', target:Math.max(1,Math.floor(scenario.vus/2))},{duration:Math.max(1,Math.floor(scenario.duration/4))+'s',target:scenario.vus},{duration:Math.max(1,scenario.duration-2*Math.max(1,Math.floor(scenario.duration/4)))+'s',target:scenario.vus}]} },
 thresholds: { http_req_duration:['p(95)<='+scenario.p95Limit], checks:['rate>='+ (1-scenario.errorLimit/100)] }
};
export default function() {
 const vars = {};
 const expand = text => text.replace(/\{\{([^}]+)\}\}/g, (_,key) => vars[key] ?? '{{'+key+'}}');
 for (const step of scenario.steps) {
  const headers = {'Content-Type':'application/json','X-Demo-Profile':scenario.profile};
  for (const [k,v] of Object.entries(step.headers || {})) headers[k] = expand(v);
  const response = http.request(step.method, (__ENV.BASE_URL || 'http://127.0.0.1:8099')+expand(step.path), step.body ? expand(step.body) : null, {headers, tags:{name:step.name},timeout:'3s',redirects:0});
  let ok = response.status === step.expect;
  if (ok && step.extract) { try { const value = response.json(step.extract); ok = value !== undefined && value !== null; if (ok) vars[step.extract] = String(value); } catch { ok=false; } }
  check(response, {[step.name+' assertion and extraction']:() => ok});
  if (!ok) break;
 }
 sleep(scenario.thinkMs/1000);
}
// k6 uses a smooth ramp; Studio's native ramp uses three discrete VU stages.
// Exported thresholds judge completion; Studio's consecutive-window protection is not reproduced.
`
}
