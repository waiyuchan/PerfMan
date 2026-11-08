package studio

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/evanw/esbuild/pkg/api"
	"github.com/ohler55/ojg/jp"
)

func osSeedPassword() string {
	if p := os.Getenv("PERFMAN_INITIAL_PASSWORD"); p != "" {
		return p
	}
	return "PerfMan2026!"
}
func extractValue(body any, expr string) (any, error) {
	if expr == "" || expr == "$" {
		return body, nil
	}
	p, err := jp.ParseString(expr)
	if err != nil {
		return nil, err
	}
	v := p.Get(body)
	if len(v) == 0 {
		return nil, errors.New("path_not_found")
	}
	if len(v) == 1 {
		return v[0], nil
	}
	return v, nil
}
func expandVars(text string, vars map[string]string) string {
	rx := regexp.MustCompile(`\$\{([^}]+)\}|\{\{([^}]+)\}\}`)
	return rx.ReplaceAllStringFunc(text, func(s string) string {
		key := strings.TrimSuffix(strings.TrimPrefix(s, "${"), "}")
		if strings.HasPrefix(s, "{{") {
			key = strings.TrimSuffix(strings.TrimPrefix(s, "{{"), "}}")
		}
		if v, ok := vars[key]; ok {
			return v
		}
		return s
	})
}
func validateFile(o Obj) error {
	content := str(o, "content")
	if len(content) > 4<<20 {
		return errors.New("file_too_large")
	}
	name := str(o, "name")
	if path.Base(name) != name || strings.ContainsAny(name, "\\\x00") {
		return errors.New("invalid_filename")
	}
	switch str(o, "type") {
	case "parameter":
		rows, err := csv.NewReader(strings.NewReader(content)).ReadAll()
		if err != nil || len(rows) < 2 {
			return errors.New("invalid_csv")
		}
		seen := map[string]bool{}
		for _, s := range rows[0] {
			if s == "" || seen[s] {
				return errors.New("duplicate_csv_column")
			}
			seen[s] = true
		}
		o["columns"] = rows[0]
		o["rows"] = len(rows) - 1
	case "protocol":
		if strings.HasSuffix(name, ".zip") {
			return unpackProtocols(o)
		}
		if !strings.HasSuffix(name, ".proto") && !strings.HasSuffix(name, ".jce") {
			return errors.New("protocol_file_required")
		}
		if !strings.Contains(content, "message") && !strings.HasSuffix(name, ".jce") {
			return errors.New("invalid_protocol")
		}
	case "jmeter":
		if _, _, err := parseJMX(content); err != nil {
			return err
		}
	case "request", "module", "plugin":
	default:
		return errors.New("invalid_file_type")
	}
	return nil
}
func (w *Workspace) validateScenario(s Obj) error {
	if w.find("projects", str(s, "projectId")) == nil {
		return errors.New("project_not_found")
	}
	if !has([]string{"simple", "script", "jmeter"}, str(s, "mode")) {
		return errors.New("invalid_scenario_mode")
	}
	if !has([]string{"simulator", "native"}, str(s, "engine")) {
		return errors.New("engine_not_supported")
	}
	if num(s, "duration") < 3 || num(s, "duration") > 3600 || num(s, "vus") < 1 || num(s, "vus") > 1000000 || num(s, "thinkMs") < 0 {
		return errors.New("invalid_load")
	}
	if str(s, "engine") == "native" && (num(s, "vus") > 20 || str(s, "protocol") != "HTTP") {
		return errors.New("native_engine_limit")
	}
	if !has([]string{"constant", "ramp", "rps", "spike"}, str(s, "loadModel")) {
		return errors.New("invalid_load_model")
	}
	if num(s, "rps") < 1 || num(s, "maxRps") < num(s, "rps") {
		return errors.New("invalid_rps")
	}
	g := w.find("groups", str(s, "groupId"))
	if g == nil {
		return errors.New("group_not_found")
	}
	total := 0.0
	seen := map[string]bool{}
	for _, r := range arr(s["regions"]) {
		if num(r, "percent") <= 0 || seen[str(r, "region")] || !has(stringsOf(g["regions"]), str(r, "region")) {
			return errors.New("invalid_regions")
		}
		seen[str(r, "region")] = true
		total += num(r, "percent")
	}
	if total < 99.99 || total > 100.01 {
		return errors.New("region_total_required")
	}
	if envID := str(s, "environmentId"); envID != "" {
		e := w.find("environments", envID)
		if e == nil || str(e, "projectId") != str(s, "projectId") {
			return errors.New("environment_not_found")
		}
	}
	bundle := []Obj{}
	csvColumns := map[string]bool{}
	for _, fid := range stringsOf(s["fileIds"]) {
		f := w.find("files", fid)
		if f == nil || str(f, "projectId") != str(s, "projectId") {
			return errors.New("file_not_found")
		}
		bundle = append(bundle, f)
		if str(f, "type") == "parameter" {
			for _, column := range stringsOf(f["columns"]) {
				if csvColumns[column] {
					return errors.New("duplicate_csv_column")
				}
				csvColumns[column] = true
			}
		}
	}
	if err := validateProtocolImports(bundle); err != nil {
		return err
	}
	if str(s, "mode") == "simple" {
		steps := arr(s["steps"])
		if len(steps) == 0 || len(steps) > 30 {
			return errors.New("steps_required")
		}
		names := map[string]bool{}
		for _, st := range steps {
			if str(st, "name") == "" || names[str(st, "name")] || str(st, "url") == "" {
				return errors.New("invalid_step")
			}
			names[str(st, "name")] = true
		}
	}
	if str(s, "mode") == "script" {
		entries := arr(s["scripts"])
		weight := 0.0
		for _, e := range entries {
			if str(e, "name") == "" || num(e, "weight") < 0 || len(str(e, "content")) > 100000 {
				return errors.New("invalid_script")
			}
			weight += num(e, "weight")
		}
		if weight <= 0 {
			return errors.New("script_weight_required")
		}
		if len(entries) > 12 {
			return errors.New("too_many_scripts")
		}
	}
	if str(s, "mode") == "jmeter" {
		f := w.find("files", str(s, "jmxId"))
		if f == nil || str(f, "projectId") != str(s, "projectId") || str(f, "type") != "jmeter" {
			return errors.New("jmx_required")
		}
		if _, _, err := parseJMX(str(f, "content")); err != nil {
			return err
		}
	}
	for _, rule := range arr(s["sla"]) {
		if !has([]string{"p95", "p99", "mean", "errorRate", "checkFailureRate", "rps", "requests"}, str(rule, "metric")) || num(rule, "threshold") < 0 || num(rule, "windows") < 1 {
			return errors.New("invalid_sla_rule")
		}
	}
	return nil
}
func parseHAR(content string) ([]Obj, error) {
	var input struct {
		Log struct {
			Entries []struct {
				Request struct {
					Method, URL string
					Headers     []struct{ Name, Value string }
					PostData    struct{ Text string }
				}
				Response struct{ Status int }
			}
		}
	}
	if json.Unmarshal([]byte(content), &input) != nil {
		return nil, errors.New("invalid_har")
	}
	steps := []Obj{}
	for _, e := range input.Log.Entries {
		if len(steps) >= 30 {
			break
		}
		st := defaultStep("HTTP")
		st["name"] = fmt.Sprintf("%s request %d", e.Request.Method, len(steps)+1)
		st["method"] = e.Request.Method
		st["url"] = e.Request.URL
		st["body"] = e.Request.PostData.Text
		h := Obj{}
		for _, v := range e.Request.Headers {
			if !has([]string{"authorization", "cookie", "set-cookie"}, strings.ToLower(v.Name)) {
				h[v.Name] = v.Value
			}
		}
		st["headers"] = h
		st["checks"] = []Obj{{"name": "Recorded status", "type": "status", "expected": e.Response.Status, "operator": "eq"}}
		steps = append(steps, st)
	}
	if len(steps) == 0 {
		return nil, errors.New("har_empty")
	}
	return steps, nil
}

type evaluation struct {
	Samples      []Obj
	Checks       []Obj
	Logs         []Obj
	Error        string
	Vars         map[string]string
	Scene        Obj
	Run          Obj
	W            *Workspace
	Redis        map[string]any
	Files        []Obj
	Secrets      []string
	Entry        string
	Weight       float64
	SleepSeconds float64
	Databases    map[string]*sql.DB
}

func (e *evaluation) log(level, source, message string) {
	for _, v := range e.Secrets {
		if v != "" {
			message = strings.ReplaceAll(message, v, "[redacted]")
		}
	}
	if len(message) > 2000 {
		message = message[:2000]
	}
	if len(e.Logs) < 100 {
		e.Logs = append(e.Logs, Obj{"at": now(), "level": level, "source": source, "message": message})
	}
}
func (e *evaluation) request(protocol, method, url, body string, headers Obj) Obj {
	if len(e.Samples) >= 100 {
		e.Error = "request_limit_exceeded"
		return Obj{"status": 0, "body": "", "json": func() any { return Obj{} }}
	}
	n := len(e.Samples)
	status := 200
	payload := any(Obj{"ok": true, "id": "sku-1042", "name": "Studio desk", "price": 149.95, "data": Obj{"id": "item-42", "items": []any{Obj{"id": "item-42"}}}})
	latency := float64(25 + (len(url)+len(body)+n*7)%35)
	lower := strings.ToLower(url)
	if strings.Contains(lower, "auth") || strings.Contains(lower, "login") {
		payload = Obj{"token": "workspace-token", "userId": "u-1042"}
	}
	if strings.Contains(lower, "orders") && method == "POST" {
		status = 201
		payload = Obj{"ok": true, "orderId": "ord-9241", "total": 149.95}
		latency += 35
	}
	if protocol == "gRPC" {
		status = 0
		payload = Obj{"id": "sku-1042", "name": "Studio desk", "v": 3}
	}
	if protocol == "WebSocket" {
		status = 101
	}
	if protocol == "SQL" {
		payload = []any{Obj{"id": "ord-9241", "total": 149.95}, Obj{"id": "ord-9242", "total": 89.5}}
	}
	if protocol == "Redis" {
		payload = Obj{"result": "OK"}
	}
	if protocol == "TCP" || protocol == "UDP" {
		payload = Obj{"data": "PONG", "bytes": 4}
	}
	profile := str(e.Scene, "profile")
	if profile == "latency" {
		latency *= 9
	}
	if profile == "errors" && (n%3 == 0) {
		status = 503
	}
	if strings.Contains(lower, "unreachable") || strings.Contains(lower, "offline") {
		status = 0
		latency = 3000
	}
	message := ""
	if profile == "errors" && n%3 == 0 && protocol != "HTTP" {
		message = "Provider operation failed"
		if protocol == "gRPC" {
			status = 14
		}
	}
	if strings.Contains(lower, "unreachable") {
		message = "Connection timed out"
	}
	if str(e.Scene, "engine") == "native" {
		if protocol != "HTTP" {
			e.Error = "native_engine_limit"
		} else {
			start := time.Now()
			target := "/target-api/catalog"
			if strings.Contains(lower, "auth") || strings.Contains(lower, "login") {
				target = "/target-api/auth"
			}
			if strings.Contains(lower, "orders") {
				target = "/target-api/orders"
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			req, _ := http.NewRequestWithContext(ctx, method, e.W.base+target, strings.NewReader(body))
			for k, v := range headers {
				req.Header.Set(k, fmt.Sprint(v))
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				status = 0
				message = "HTTP connection failed"
			} else {
				status = resp.StatusCode
				buf, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
				resp.Body.Close()
				json.Unmarshal(buf, &payload)
			}
			cancel()
			latency = time.Since(start).Seconds() * 1000
		}
	}
	timeout := num(obj(e.Scene["options"]), "timeoutMs")
	if timeout > 0 && latency > timeout && str(e.Scene, "engine") != "native" {
		latency = timeout
		status = 0
		message = "Request timed out"
		if protocol == "gRPC" {
			status = 4
		}
	}
	bytes, _ := json.Marshal(payload)
	sample := Obj{"id": uid("sample"), "name": e.redact(method + " " + url), "script": e.Entry, "scriptWeight": e.Weight, "protocol": protocol, "method": method, "url": e.redact(url), "status": status, "duration": number(latency), "requestBody": e.redact(body), "responseBody": e.redact(string(bytes)), "error": message, "source": str(e.Run, "source"), "checks": []Obj{}, "timing": Obj{"dns": number(latency * .03), "connect": number(latency * .07), "tls": number(latency * .11), "send": number(latency * .02), "wait": number(latency * .72), "receive": number(latency * .05)}}
	if str(e.Scene, "engine") == "native" {
		sample["timing"] = Obj{"total": number(latency)}
	}
	e.Samples = append(e.Samples, sample)
	return Obj{"status": status, "statusCode": status, "body": string(bytes), "data": payload, "headers": Obj{"Content-Type": "application/json"}, "__sampleId": sample["id"], "json": func(args ...string) any {
		if len(args) > 0 {
			v, _ := extractValue(payload, args[0])
			return v
		}
		return payload
	}}
}
func compareValues(actual, expected any, op string) bool {
	as, es := fmt.Sprint(actual), fmt.Sprint(expected)
	switch op {
	case "ne":
		return as != es
	case "contains":
		return strings.Contains(as, es)
	case "gt", "gte", "lt", "lte":
		var a, b float64
		fmt.Sscan(as, &a)
		fmt.Sscan(es, &b)
		switch op {
		case "gt":
			return a > b
		case "gte":
			return a >= b
		case "lt":
			return a < b
		default:
			return a <= b
		}
	default:
		return as == es
	}
}
func (e *evaluation) check(name string, passed bool, sampleID string) {
	c := Obj{"name": name, "passed": passed, "sampleId": sampleID, "script": e.Entry, "scriptWeight": e.Weight}
	e.Checks = append(e.Checks, c)
	for _, s := range e.Samples {
		if str(s, "id") == sampleID {
			s["checks"] = append(arr(s["checks"]), c)
		}
	}
	if !passed {
		e.log("warning", "checks", "Check failed: "+name)
	}
}
func (e *evaluation) simple(steps []Obj) {
	for _, step := range steps {
		headers := Obj{}
		for k, v := range obj(step["headers"]) {
			headers[k] = expandVars(fmt.Sprint(v), e.Vars)
		}
		e.Entry = str(step, "threadGroup")
		if num(step, "scriptWeight") > 0 {
			e.Weight = num(step, "scriptWeight")
		}
		res := e.request(str(step, "protocol"), str(step, "method"), expandVars(str(step, "url"), e.Vars), expandVars(str(step, "body"), e.Vars), headers)
		sample := e.Samples[len(e.Samples)-1]
		sample["name"] = str(step, "name")
		var payload any
		json.Unmarshal([]byte(str(res, "body")), &payload)
		for _, extract := range arr(step["extracts"]) {
			var value any
			var err error
			if str(extract, "mode") == "regex" {
				var rx *regexp.Regexp
				rx, err = regexp.Compile(str(extract, "path"))
				if err == nil {
					matches := rx.FindStringSubmatch(str(res, "body"))
					if len(matches) > 1 {
						value = matches[1]
					} else if len(matches) > 0 {
						value = matches[0]
					} else {
						err = errors.New("not_found")
					}
				}
			} else {
				value, err = extractValue(payload, str(extract, "path"))
			}
			if err != nil {
				e.Error = "Extraction failed: " + str(extract, "name")
				e.log("error", "engine", e.Error)
				return
			}
			e.Vars[str(extract, "name")] = fmt.Sprint(value)
		}
		for _, rule := range arr(step["checks"]) {
			actual := any(res["status"])
			switch str(rule, "type") {
			case "json":
				actual, _ = extractValue(payload, str(rule, "path"))
			case "contains", "regex":
				actual = str(res, "body")
			case "latency":
				actual = sample["duration"]
			}
			passed := compareValues(actual, rule["expected"], str(rule, "operator"))
			if str(rule, "type") == "regex" {
				rx, err := regexp.Compile(fmt.Sprint(rule["expected"]))
				passed = err == nil && rx.MatchString(fmt.Sprint(actual))
			}
			e.check(str(rule, "name"), passed, str(sample, "id"))
		}
	}
}
func (w *Workspace) evaluate(scene, run Obj) Obj {
	e := &evaluation{Samples: []Obj{}, Checks: []Obj{}, Logs: []Obj{}, Vars: map[string]string{}, Scene: scene, Run: run, W: w, Redis: map[string]any{}}
	e.Weight = 100
	for _, f := range arr(run["_files"]) {
		e.Files = append(e.Files, f)
	}
	if run["_files"] == nil {
		for _, fid := range stringsOf(scene["fileIds"]) {
			if f := w.find("files", fid); f != nil {
				e.Files = append(e.Files, f)
			}
		}
	}
	env := obj(run["_environment"])
	if len(env) == 0 {
		env = w.find("environments", str(scene, "environmentId"))
	}
	if env != nil {
		for _, v := range arr(env["variables"]) {
			e.Vars[str(v, "name")] = w.decrypt(str(v, "value"))
			if flag(v, "secret") {
				e.Secrets = append(e.Secrets, e.Vars[str(v, "name")])
			}
		}
	}
	e.Files = bundledFiles(e.Files)
	iteration := int(num(run, "elapsed"))
	for _, f := range e.Files {
		if f != nil && str(f, "type") == "parameter" {
			rows, err := csv.NewReader(strings.NewReader(str(f, "content"))).ReadAll()
			if err == nil && len(rows) > 1 {
				for i, k := range rows[0] {
					dataRows := rows[1:]
					if flag(scene, "csvSplit") && num(run, "shardCount") > 1 {
						partition := [][]string{}
						for idx, row := range dataRows {
							if idx%int(num(run, "shardCount")) == int(num(run, "shardIndex")) {
								partition = append(partition, row)
							}
						}
						dataRows = partition
					}
					if len(dataRows) == 0 {
						e.Error = "dataset_partition_empty"
						return Obj{"valid": false, "error": e.redact(e.Error), "samples": e.Samples, "checks": e.Checks, "logs": e.Logs}
					}
					row := dataRows[iteration%len(dataRows)]
					if i < len(row) {
						e.Vars[k] = row[i]
					}
				}
			}
		}
	}
	switch str(scene, "mode") {
	case "simple":
		e.simple(arr(scene["steps"]))
	case "jmeter":
		var f Obj
		for _, file := range e.Files {
			if str(file, "id") == str(scene, "jmxId") {
				f = file
			}
		}
		if f == nil {
			e.Error = "jmx_required"
		} else {
			steps, groups, err := parseJMX(str(f, "content"))
			if err != nil {
				e.Error = err.Error()
			} else {
				for _, g := range groups {
					if csvName := str(g, "csvFile"); csvName != "" {
						found := false
						for _, file := range e.Files {
							if str(file, "name") == csvName {
								found = true
							}
						}
						if !found {
							e.Error = "jmeter_csv_missing: " + csvName
							return Obj{"valid": false, "error": e.redact(e.Error), "samples": e.Samples, "checks": e.Checks, "logs": e.Logs}
						}
					}
				}
				for _, step := range steps {
					if str(step, "protocol") == "WebSocket" {
						found := false
						for _, f := range e.Files {
							if str(f, "type") == "plugin" && strings.Contains(strings.ToLower(str(f, "name")), "websocket") {
								found = true
							}
						}
						if !found {
							e.Error = "websocket_plugin_required"
							return Obj{"valid": false, "error": e.redact(e.Error), "samples": e.Samples, "checks": e.Checks, "logs": e.Logs}
						}
					}
				}
				if str(scene, "threadMode") == "serial" && len(groups) > 1 {
					phase := min(len(groups)-1, int(num(run, "elapsed")/math.Max(1, num(scene, "duration")/float64(len(groups)))))
					selected := []Obj{}
					for _, step := range steps {
						if str(step, "threadGroup") == str(groups[phase], "name") {
							selected = append(selected, step)
						}
					}
					steps = selected
				}
				e.simple(steps)
				if flag(scene, "logRequests") {
					for _, sample := range e.Samples {
						e.log("info", "jmeter", fmt.Sprintf("Sampler %s: status %.0f, %.2f ms", str(sample, "name"), num(sample, "status"), num(sample, "duration")))
					}
				}
				if flag(scene, "logChecks") {
					for _, check := range e.Checks {
						e.log("info", "jmeter", fmt.Sprintf("Assertion %s: passed=%t", str(check, "name"), flag(check, "passed")))
					}
				}
				e.log("info", "jmeter", fmt.Sprintf("%d thread groups, %s execution; %.0f loops. CSV split: %t", len(groups), str(scene, "threadMode"), num(scene, "loops"), flag(scene, "csvSplit")))
			}
		}
	case "script":
		w.executeScripts(e)
	}
	for _, sample := range e.Samples {
		if str(sample, "protocol") == "HTTP" && num(sample, "status") >= 500 || str(sample, "error") != "" {
			e.log("error", "engine", fmt.Sprintf("%s returned %.0f", str(sample, "name"), num(sample, "status")))
		}
	}
	return Obj{"valid": e.Error == "", "error": e.redact(e.Error), "samples": e.Samples, "checks": e.Checks, "logs": e.Logs, "sleepSeconds": e.SleepSeconds}
}
func compileScript(entries []Obj, entry string, files []Obj) (string, error) {
	sources := map[string]string{}
	for _, s := range entries {
		sources[path.Clean(str(s, "name"))] = str(s, "content")
	}
	for _, f := range files {
		if str(f, "type") == "module" {
			sources[str(f, "name")] = str(f, "content")
			if str(f, "sourceUrl") != "" {
				sources[str(f, "sourceUrl")] = str(f, "content")
			}
		}
	}
	result := api.Build(api.BuildOptions{EntryPoints: []string{entry}, Bundle: true, Write: false, Format: api.FormatCommonJS, Platform: api.PlatformNeutral, Target: api.ES2018, LogLevel: api.LogLevelSilent, Plugins: []api.Plugin{{Name: "workspace-files", Setup: func(b api.PluginBuild) {
		b.OnResolve(api.OnResolveOptions{Filter: ".*"}, func(a api.OnResolveArgs) (api.OnResolveResult, error) {
			if a.Path == "perfman" || strings.HasPrefix(a.Path, "perfman/") {
				return api.OnResolveResult{Path: a.Path, External: true}, nil
			}
			p := path.Clean(a.Path)
			if strings.HasPrefix(a.Path, "https://") {
				p = a.Path
			}
			if a.Importer != "" && !strings.HasPrefix(a.Path, "https://") {
				p = path.Clean(path.Join(path.Dir(a.Importer), a.Path))
			}
			if _, ok := sources[p]; !ok {
				return api.OnResolveResult{}, fmt.Errorf("module not found: %s", a.Path)
			}
			return api.OnResolveResult{Path: p, Namespace: "workspace"}, nil
		})
		b.OnLoad(api.OnLoadOptions{Filter: ".*", Namespace: "workspace"}, func(a api.OnLoadArgs) (api.OnLoadResult, error) {
			s := sources[a.Path]
			return api.OnLoadResult{Contents: &s, Loader: api.LoaderJS}, nil
		})
	}}}})
	if len(result.Errors) > 0 {
		err := result.Errors[0]
		at := ""
		if err.Location != nil {
			at = fmt.Sprintf("%s:%d:%d ", err.Location.File, err.Location.Line, err.Location.Column)
		}
		return "", errors.New(at + err.Text)
	}
	return string(result.OutputFiles[0].Contents), nil
}

type scriptSession struct {
	vm      *goja.Runtime
	eval    *evaluation
	exports *goja.Object
	main    goja.Callable
	data    goja.Value
}

func (e *evaluation) redact(s string) string {
	for _, v := range e.Secrets {
		if v != "" {
			s = strings.ReplaceAll(s, v, "[redacted]")
		}
	}
	return s
}
func (w *Workspace) executeScripts(e *evaluation) {
	if w.scripts == nil {
		w.scripts = map[string]*scriptSession{}
	}
	for _, entry := range arr(e.Scene["scripts"]) {
		if num(entry, "weight") <= 0 {
			continue
		}
		key := str(e.Run, "id") + "|" + str(entry, "name")
		persistent := strings.HasPrefix(str(e.Run, "id"), "run_") && str(e.Run, "status") == "running"
		session := w.scripts[key]
		if !persistent {
			session = nil
		}
		if session == nil {
			code, err := compileScript(arr(e.Scene["scripts"]), str(entry, "name"), e.Files)
			if err != nil {
				e.Error = err.Error()
				return
			}
			local := *e
			local.Samples = []Obj{}
			local.Checks = []Obj{}
			local.Logs = []Obj{}
			local.Entry = str(entry, "name")
			local.Weight = num(entry, "weight")
			local.SleepSeconds = 0
			session = &scriptSession{vm: goja.New(), eval: &local, data: goja.Undefined()}
			vm := session.vm
			se := session.eval
			timer := time.AfterFunc(300*time.Millisecond, func() { vm.Interrupt("Script execution timed out") })
			err = func() (err error) {
				defer func() {
					if r := recover(); r != nil {
						err = fmt.Errorf("%v", r)
					}
				}()
				vm.Set("module", map[string]any{"exports": map[string]any{}})
				vm.Set("exports", map[string]any{})
				vm.Set("console", map[string]any{"log": func(args ...any) { se.log("info", "script", fmt.Sprint(args...)) }, "error": func(args ...any) { se.log("error", "script", fmt.Sprint(args...)) }, "warn": func(args ...any) { se.log("warning", "script", fmt.Sprint(args...)) }})
				vm.Set("require", func(call goja.FunctionCall) goja.Value { return vm.ToValue(se.module(vm, call.Argument(0).String())) })
				vm.Set("open", func(name string) string {
					for _, f := range se.Files {
						if str(f, "name") == name {
							return str(f, "content")
						}
					}
					panic(vm.NewGoError(errors.New("File not found: " + name)))
				})
				if _, err = vm.RunString(code); err != nil {
					return err
				}
				session.exports = vm.Get("module").ToObject(vm).Get("exports").ToObject(vm)
				if option := session.exports.Get("option"); option != nil && !goja.IsUndefined(option) {
					opts := obj(option.Export())
					copy := clone(se.Scene)
					merged := clone(obj(copy["options"]))
					for k, v := range obj(opts["http"]) {
						if k == "timeout" {
							merged["timeoutMs"] = v
						} else {
							merged[k] = v
						}
					}
					copy["options"] = merged
					se.Scene = copy
				}
				if setup, ok := goja.AssertFunction(session.exports.Get("setup")); ok {
					session.data, err = setup(goja.Undefined())
					if err != nil {
						return err
					}
					se.log("info", "script", "setup completed")
				}
				main, ok := goja.AssertFunction(session.exports.Get("default"))
				if !ok {
					return errors.New("Entry script must export a default function")
				}
				session.main = main
				return nil
			}()
			timer.Stop()
			if err != nil {
				session.eval.closeDatabases()
				e.Error = err.Error()
				e.log("error", "script", e.Error)
				return
			}
			if persistent {
				w.scripts[key] = session
			}
		} else {
			session.eval.Samples = []Obj{}
			session.eval.Checks = []Obj{}
			session.eval.Logs = []Obj{}
			session.eval.SleepSeconds = 0
			session.eval.Vars = e.Vars
			session.eval.Run = e.Run
		}
		timer := time.AfterFunc(300*time.Millisecond, func() { session.vm.Interrupt("Script execution timed out") })
		_, err := session.main(goja.Undefined(), session.data)
		timer.Stop()
		if err != nil {
			e.Error = err.Error()
		}
		if session.eval.Error != "" {
			e.Error = session.eval.Error
		}
		if !persistent {
			if teardown, ok := goja.AssertFunction(session.exports.Get("teardown")); ok {
				timer := time.AfterFunc(300*time.Millisecond, func() { session.vm.Interrupt("Teardown timed out") })
				_, err = teardown(goja.Undefined(), session.data)
				timer.Stop()
				if err != nil {
					e.Error = err.Error()
				}
				session.eval.log("info", "script", "teardown completed")
			}
		}
		if !persistent {
			session.eval.closeDatabases()
		}
		e.Samples = append(e.Samples, session.eval.Samples...)
		e.Checks = append(e.Checks, session.eval.Checks...)
		e.Logs = append(e.Logs, session.eval.Logs...)
		e.SleepSeconds += session.eval.SleepSeconds
		if e.Error != "" {
			e.log("error", "script", e.Error)
			return
		}
	}
}
func (w *Workspace) teardownScripts(run Obj) {
	for key, s := range w.scripts {
		if !strings.HasPrefix(key, str(run, "id")+"|") && !strings.HasPrefix(key, str(run, "id")+"-") {
			continue
		}
		if teardown, ok := goja.AssertFunction(s.exports.Get("teardown")); ok {
			timer := time.AfterFunc(300*time.Millisecond, func() { s.vm.Interrupt("Teardown timed out") })
			_, err := teardown(goja.Undefined(), s.data)
			timer.Stop()
			if err != nil {
				w.addRunEvent(run, "warning", "Teardown: "+err.Error())
			}
		}
		run["logs"] = append(arr(run["logs"]), s.eval.Logs...)
		s.eval.closeDatabases()
		delete(w.scripts, key)
	}
}
func (e *evaluation) module(vm *goja.Runtime, name string) any {
	callRequest := func(protocol, method, url string, body any) Obj {
		b := ""
		if body != nil {
			if s, ok := body.(string); ok {
				b = s
			} else {
				raw, _ := json.Marshal(body)
				b = string(raw)
			}
		}
		return e.request(protocol, method, url, b, Obj{})
	}
	switch name {
	case "perfman":
		return Obj{"check": func(c goja.FunctionCall) goja.Value {
			name := c.Argument(0).String()
			fn, ok := goja.AssertFunction(c.Argument(1))
			passed := false
			if ok {
				result, err := fn(goja.Undefined())
				passed = err == nil && result.ToBoolean()
			}
			sid := ""
			if !goja.IsUndefined(c.Argument(2)) && !goja.IsNull(c.Argument(2)) {
				value := c.Argument(2).ToObject(vm).Get("__sampleId")
				if value != nil && !goja.IsUndefined(value) {
					sid = value.String()
				}
			}
			e.check(name, passed, sid)
			return vm.ToValue(passed)
		}, "sleep": func(seconds float64) { e.SleepSeconds += seconds }, "env": func() any { return e.Vars }, "metadata": func() any {
			return Obj{"userId": "usr_alex", "projectId": e.Scene["projectId"], "scenarioId": e.Scene["id"], "jobId": e.Run["id"], "runId": e.Run["id"], "region": func() string {
				if str(e.Run, "region") != "" {
					return str(e.Run, "region")
				}
				return "us-east-1"
			}(), "workerId": str(e.Run, "workerId"), "shardId": str(e.Run, "shardId"), "vu": 1, "iteration": int(num(e.Run, "elapsed"))}
		}}
	case "perfman/http":
		return Obj{"get": func(url string, args ...any) Obj { return e.httpScript("GET", url, nil, args) }, "post": func(url string, body any, args ...any) Obj { return e.httpScript("POST", url, body, args) }, "put": func(url string, body any, args ...any) Obj { return e.httpScript("PUT", url, body, args) }, "patch": func(url string, body any, args ...any) Obj { return e.httpScript("PATCH", url, body, args) }, "del": func(url string, args ...any) Obj { return e.httpScript("DELETE", url, nil, args) }, "request": func(method, url string, body any, args ...any) Obj { return e.httpScript(method, url, body, args) }}
	case "perfman/grpc":
		return Obj{"Client": func(c goja.ConstructorCall) *goja.Object {
			var url string
			c.This.Set("load", func(_ any, file string) {
				found := false
				for _, id := range stringsOf(e.Scene["fileIds"]) {
					f := e.W.find("files", id)
					if f != nil && str(f, "name") == file {
						found = true
					}
				}
				if !found {
					panic(vm.NewGoError(errors.New("Protocol file not found: " + file)))
				}
			})
			c.This.Set("connect", func(address string, args ...any) { url = address })
			c.This.Set("invoke", func(method string, body any) Obj { return callRequest("gRPC", "INVOKE", url+"/"+method, body) })
			c.This.Set("close", func() {})
			return nil
		}}
	case "perfman/sql":
		return e.sqlModule(vm)
	case "perfman/redis":
		return e.redisModule(vm)
	case "perfman/ws", "perfman/socketio":
		return Obj{"connect": func(c goja.FunctionCall) goja.Value {
			protocol := "WebSocket"
			status := 101
			if name == "perfman/socketio" {
				protocol = "Socket.IO"
				status = 200
			}
			url := c.Argument(0).String()
			socket := vm.NewObject()
			callbacks := map[string]goja.Callable{}
			socket.Set("on", func(event string, callback goja.Value) {
				if fn, ok := goja.AssertFunction(callback); ok {
					callbacks[event] = fn
					if event == "open" {
						fn(goja.Undefined())
					}
				}
			})
			socket.Set("send", func(message string) {
				callRequest(protocol, "SEND", url, message)
				if fn := callbacks["message"]; fn != nil {
					fn(goja.Undefined(), vm.ToValue(message))
				}
			})
			socket.Set("emit", func(event string, data any, ack goja.Value) {
				callRequest(protocol, "EMIT", url+"/"+event, data)
				if fn, ok := goja.AssertFunction(ack); ok {
					fn(goja.Undefined(), vm.ToValue(Obj{"ok": true}))
				}
			})
			socket.Set("ping", func() { callRequest(protocol, "PING", url, nil) })
			socket.Set("close", func() { callRequest(protocol, "CLOSE", url, nil) })
			for _, key := range []string{"setTimeout", "setInterval", "setLoop"} {
				socket.Set(key, func(c goja.FunctionCall) goja.Value {
					if fn, ok := goja.AssertFunction(c.Argument(0)); ok {
						fn(goja.Undefined())
					}
					return goja.Undefined()
				})
			}
			callback := c.Argument(1)
			if _, ok := goja.AssertFunction(callback); !ok {
				callback = c.Argument(2)
			}
			if fn, ok := goja.AssertFunction(callback); ok {
				if _, err := fn(goja.Undefined(), socket); err != nil {
					panic(vm.NewGoError(err))
				}
			}
			return vm.ToValue(Obj{"status": status})
		}}
	case "perfman/socket":
		return e.socketModule(vm)
	case "perfman/protobuf":
		return Obj{"load": func(_ any, file string) {
			found := false
			for _, f := range e.Files {
				if f != nil && str(f, "name") == file {
					found = true
				}
			}
			if !found {
				panic(vm.NewGoError(errors.New("Protocol file not found: " + file)))
			}
		}, "marshal": func(t string, v any) string {
			callRequest("Protobuf", "MARSHAL", t, v)
			b, _ := json.Marshal(v)
			return base64.StdEncoding.EncodeToString(b)
		}, "unmarshal": func(t, b string) any {
			callRequest("Protobuf", "UNMARSHAL", t, nil)
			buf, _ := base64.StdEncoding.DecodeString(b)
			var v any
			json.Unmarshal(buf, &v)
			return v
		}}
	case "perfman/dataset":
		return Obj{"get": func(k string) string { return e.Vars[k] }}
	case "perfman/jsonpath":
		return Obj{"get": func(body, expr string) any {
			var v any
			json.Unmarshal([]byte(body), &v)
			out, _ := extractValue(v, expr)
			return out
		}}
	default:
		panic(vm.NewGoError(errors.New("Unsupported module: " + name)))
	}
}

func (e *evaluation) httpScript(method, url string, body any, args []any) Obj {
	headers := Obj{}
	if len(args) > 0 {
		for k, v := range obj(obj(args[0])["headers"]) {
			headers[k] = v
		}
	}
	raw := ""
	if body != nil {
		if v, ok := body.(string); ok {
			raw = v
		} else {
			b, _ := json.Marshal(body)
			raw = string(b)
		}
	}
	return e.request("HTTP", method, url, raw, headers)
}
