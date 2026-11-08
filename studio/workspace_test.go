package studio

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func workspaceFixture(t *testing.T) (*Workspace, *httptest.Server, *http.Client) {
	t.Helper()
	w, err := NewWorkspace(filepath.Join(t.TempDir(), "workspace.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(w.Handler())
	w.base = s.URL
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	t.Cleanup(func() { w.Close(); s.Close() })
	status, _ := workspaceRequest(t, client, s.URL, "session", "POST", Obj{"email": "alex.morgan@acme.io", "password": "PerfMan2026!"})
	if status != 200 {
		t.Fatal(status)
	}
	return w, s, client
}
func workspaceRequest(t *testing.T, c *http.Client, base, path, method string, in any) (int, Obj) {
	t.Helper()
	var data []byte
	if in != nil {
		data, _ = json.Marshal(in)
	}
	req, _ := http.NewRequest(method, base+"/api/v1/"+path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var out Obj
	json.Unmarshal(b, &out)
	return resp.StatusCode, out
}
func TestWorkspaceAuthenticationAndIsolation(t *testing.T) {
	_, s, admin := workspaceFixture(t)
	status, _ := workspaceRequest(t, http.DefaultClient, s.URL, "state", "GET", nil)
	if status != 401 {
		t.Fatal("anonymous access")
	}
	viewerJar, _ := cookiejar.New(nil)
	viewer := &http.Client{Jar: viewerJar}
	workspaceRequest(t, viewer, s.URL, "session", "POST", Obj{"email": "casey.lee@acme.io", "password": "PerfMan2026!"})
	status, result := workspaceRequest(t, viewer, s.URL, "state", "GET", nil)
	if status != 200 {
		t.Fatal(status)
	}
	for _, scene := range arr(obj(result["collections"])["scenarios"]) {
		if str(scene, "projectId") != "prj_commerce" {
			t.Fatal("cross-project record")
		}
	}
	status, _ = workspaceRequest(t, viewer, s.URL, "runs", "POST", Obj{"scenarioId": "scn_checkout"})
	if status != 403 {
		t.Fatal("viewer could run")
	}
	status, result = workspaceRequest(t, admin, s.URL, "state", "GET", nil)
	b, _ := json.Marshal(result)
	if strings.Contains(string(b), "passwordHash") || strings.Contains(string(b), "acme-test-key-2026") || strings.Contains(string(b), "enc:") {
		t.Fatal("credential leaked")
	}
}
func TestWorkspaceProtocolTemplatesExecute(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	for _, scene := range w.data["scenarios"] {
		t.Run(str(scene, "name"), func(t *testing.T) {
			res := w.evaluate(scene, Obj{"id": "validation", "source": "simulated"})
			if !flag(res, "valid") {
				t.Fatal(str(res, "error"))
			}
			if len(arr(res["samples"])) == 0 {
				t.Fatal("no requests")
			}
			for _, check := range arr(res["checks"]) {
				if !flag(check, "passed") {
					t.Fatal("check failed: " + str(check, "name"))
				}
			}
		})
	}
}
func TestWorkspaceMultiRegionSchedulingAndRelease(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	r, err := w.createRun(w.find("scenarios", "scn_checkout"), Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	if err = w.allocateRun(r); err != nil {
		t.Fatal(err)
	}
	shards := arr(r["shards"])
	if len(shards) < 3 {
		t.Fatal("not distributed")
	}
	total := 0.0
	for _, s := range shards {
		total += num(s, "target")
	}
	if total != 120 {
		t.Fatal("budget not conserved", total)
	}
	r["status"] = "running"
	r["startedAt"] = time.Now().Add(-3 * time.Second).UTC().Format(time.RFC3339Nano)
	w.advanceRun(r)
	if num(obj(r["metrics"]), "requests") == 0 {
		t.Fatal("no results")
	}
	w.finishRun(r, "cancelled", "inconclusive", "Test cancellation")
	for _, node := range w.data["resources"] {
		if num(node, "allocated") != 0 {
			t.Fatal("capacity leaked")
		}
	}
	for _, p := range w.data["pods"] {
		if str(p, "runId") == str(r, "id") && str(p, "status") != "terminated" {
			t.Fatal("Pod not released")
		}
	}
}
func TestWorkspaceSLAAndNodeLoss(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	scene := clone(w.find("scenarios", "scn_checkout"))
	scene["profile"] = "latency"
	r, err := w.createRun(scene, Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	w.allocateRun(r)
	r["status"] = "running"
	r["startedAt"] = time.Now().Add(-4 * time.Second).UTC().Format(time.RFC3339Nano)
	for i := 0; i < 3; i++ {
		w.advanceRun(r)
	}
	if str(r, "status") != "protected" || len(w.data["alerts"]) < 2 {
		t.Fatal("SLA did not protect")
	}
	r2, err := w.createRun(w.find("scenarios", "scn_checkout"), Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	w.allocateRun(r2)
	r2["status"] = "running"
	r2["startedAt"] = time.Now().Add(-3 * time.Second).UTC().Format(time.RFC3339Nano)
	node := w.find("resources", str(arr(r2["shards"])[0], "workerId"))
	node["status"] = "offline"
	w.advanceRun(r2)
	if str(r2, "status") != "partial" || str(r2, "verdict") != "inconclusive" {
		t.Fatal("lost shard silently passed")
	}
}
func TestWorkspaceTerminalAndAudit(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	admin := w.data["users"][0]
	s := Obj{"name": "atlas-01", "resourceId": "node_grp_global_01"}
	if err := w.upsert(admin, "terminals", s); err != nil {
		t.Fatal(err)
	}
	result, err := w.command(admin, str(s, "id"), "hostname")
	if err != nil || str(result, "output") != "atlas-01" {
		t.Fatal(result, err)
	}
	result, _ = w.command(admin, str(s, "id"), "cat environment.env")
	if strings.Contains(str(result, "output"), "acme-test-key") {
		t.Fatal("terminal credential leak")
	}
	result, _ = w.command(admin, str(s, "id"), "rm -rf /")
	if !strings.Contains(str(result, "output"), "not available") {
		t.Fatal("unsafe command accepted")
	}
	if len(w.data["audit"]) < 4 {
		t.Fatal("missing audit")
	}
}
func TestWorkspaceSnapshotAndSchedule(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	scene := w.find("scenarios", "scn_checkout")
	r, _ := w.createRun(scene, Obj{"kind": "load"}, w.data["users"][0])
	scene["name"] = "New version"
	if str(obj(r["snapshot"]), "name") == "New version" {
		t.Fatal("mutable snapshot")
	}
	schedule := Obj{"name": "Regression at nine", "projectId": "prj_commerce", "scenarioId": "scn_checkout", "frequency": "cron", "cron": "0 9 * * 1-5", "timezone": "Asia/Shanghai"}
	if err := w.upsert(w.data["users"][0], "schedules", schedule); err != nil {
		t.Fatal(err)
	}
	times, err := nextOccurrences(schedule, time.Now(), 5)
	if err != nil || len(times) != 5 {
		t.Fatal(times, err)
	}
	schedule["nextAt"] = time.Now().Add(-time.Second).UTC().Format(time.RFC3339)
	w.tick()
	w.tick()
	if len(w.data["occurrences"]) != 1 {
		t.Fatal("duplicate schedule occurrence")
	}
}
func TestWorkspaceScriptFailureAndTimeout(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	s := clone(w.find("scenarios", "scn_protocol_8"))
	s["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": "export default function(){ while(true){} }"}}
	start := time.Now()
	res := w.evaluate(s, Obj{"id": "v"})
	if flag(res, "valid") || time.Since(start) > 2*time.Second {
		t.Fatal("unbounded script")
	}
	s["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": "import {check} from 'perfman'; export default function(){check('Failing check',()=>false);}"}}
	res = w.evaluate(s, Obj{"id": "v"})
	if !flag(res, "valid") || flag(arr(res["checks"])[0], "passed") {
		t.Fatal("check did not execute")
	}
}
func TestWorkspaceCSVAndHAR(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	f := Obj{"name": "bad.csv", "type": "parameter", "content": "id,id\n1,2"}
	if validateFile(f) == nil {
		t.Fatal("duplicate columns")
	}
	steps, err := parseHAR(`{"log":{"entries":[{"request":{"method":"GET","url":"https://api.acme.io/orders","headers":[{"name":"Authorization","value":"secret"}]},"response":{"status":200}}]}}`)
	if err != nil || len(steps) != 1 || len(obj(steps[0]["headers"])) != 0 {
		t.Fatal("HAR sanitisation failed")
	}
	path := filepath.Join(t.TempDir(), "persist.db")
	w2, err := NewWorkspace(path, "")
	if err != nil {
		t.Fatal(err)
	}
	w2.data["projects"][0]["name"] = "Persisted name"
	w2.save()
	w2.Close()
	w3, err := NewWorkspace(path, "")
	if err != nil {
		t.Fatal(err)
	}
	defer w3.Close()
	if str(w3.data["projects"][0], "name") != "Persisted name" {
		t.Fatal("state did not survive restart")
	}
	_ = w
}

func TestWorkspaceWorkerContextsWeightsAndFrozenDependencies(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	scene := clone(w.find("scenarios", "scn_mixed"))
	scene["scripts"] = []Obj{{"name": "heavy.js", "weight": 70, "content": "import http from 'perfman/http'; import {check,metadata} from 'perfman'; let count=0; export default function(){count++;const r=http.get('https://api.acme.internal/heavy'); check('Context persists',()=>count>0,r);console.log(metadata().region);}"}, {"name": "light.js", "weight": 30, "content": "import http from 'perfman/http'; export default function(){http.get('https://api.acme.internal/light')}"}}
	r, err := w.createRun(scene, Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	w.allocateRun(r)
	r["status"] = "running"
	r["startedAt"] = time.Now().Add(-3 * time.Second).UTC().Format(time.RFC3339Nano)
	w.advanceRun(r)
	if len(w.scripts) != 6 {
		t.Fatalf("expected one context per worker and entry, got %d", len(w.scripts))
	}
	heavy, light := 0.0, 0.0
	for _, ep := range arr(r["endpoints"]) {
		if strings.Contains(str(ep, "name"), "heavy") {
			heavy = num(ep, "requests")
		}
		if strings.Contains(str(ep, "name"), "light") {
			light = num(ep, "requests")
		}
	}
	if math.Abs(heavy/(heavy+light)-.7) > .02 {
		t.Fatalf("weights not applied: %f %f", heavy, light)
	}
	requestTotal := 0.0
	for _, shard := range arr(r["shards"]) {
		requestTotal += num(shard, "requests")
	}
	if requestTotal != num(obj(r["metrics"]), "requests") {
		t.Fatal("shard counters do not conserve totals")
	}
	w.advanceRun(r)
	w.finishRun(r, "cancelled", "inconclusive", "Test end")
	if len(w.scripts) != 0 {
		t.Fatal("script contexts leaked")
	}
	cloneScene := clone(w.find("scenarios", "scn_checkout"))
	run, err := w.createRun(cloneScene, Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	f := w.find("files", "file_users")
	f["content"] = "customerId,email,segment\nchanged,new@example.com,test"
	result := w.evaluate(obj(run["snapshot"]), run)
	if !strings.Contains(str(arr(result["samples"])[0], "requestBody"), "avery@example.com") {
		t.Fatal("run did not retain its dataset version")
	}
}
func TestWorkspaceSecretRedactionAndPolicies(t *testing.T) {
	w, s, c := workspaceFixture(t)
	scene := clone(w.find("scenarios", "scn_mixed"))
	scene["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": "import http from 'perfman/http';import {env} from 'perfman';export default function(){console.log(env().API_TOKEN);http.post('https://api.acme.internal/send',env().API_TOKEN)}"}}
	result := w.evaluate(scene, Obj{"id": "validation"})
	b, _ := json.Marshal(result)
	if strings.Contains(string(b), "acme-test-key-2026") {
		t.Fatal("secret appeared in logs or samples")
	}
	policy := Obj{"name": "Block commerce execution", "subject": "role:engineer", "action": "runs.*", "effect": "deny", "projectId": "prj_commerce", "status": "active"}
	if err := w.upsert(w.data["users"][0], "policies", policy); err != nil {
		t.Fatal(err)
	}
	jar, _ := cookiejar.New(nil)
	engineer := &http.Client{Jar: jar}
	workspaceRequest(t, engineer, s.URL, "session", "POST", Obj{"email": "jamie.taylor@acme.io", "password": "PerfMan2026!"})
	status, _ := workspaceRequest(t, engineer, s.URL, "runs", "POST", Obj{"scenarioId": "scn_checkout"})
	if status != 400 {
		t.Fatalf("policy bypassed: %d", status)
	}
	status, _ = workspaceRequest(t, c, s.URL, "runs", "POST", Obj{"scenarioId": "scn_checkout"})
	if status != 201 {
		t.Fatal("admin incorrectly denied")
	}
}
func TestWorkspaceJMeterSamplerSupport(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	content := `<jmeterTestPlan><hashTree><ThreadGroup testname="WebSocket users"><stringProp name="ThreadGroup.num_threads">4</stringProp></ThreadGroup><hashTree><eu.luminis.jmeter.wssampler.OpenWebSocketSampler testname="Open stream"><stringProp name="server">stream.acme.internal</stringProp></eu.luminis.jmeter.wssampler.OpenWebSocketSampler></hashTree></hashTree></jmeterTestPlan>`
	steps, groups, err := parseJMX(content)
	if err != nil || len(steps) != 1 || str(steps[0], "protocol") != "WebSocket" || num(groups[0], "threads") != 4 {
		t.Fatal(steps, groups, err)
	}
	_ = w
}

func TestWorkspaceFixtureAndMetricConservation(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	for _, r := range w.data["runs"] {
		m := obj(r["metrics"])
		points, shards, endpoints := 0.0, 0.0, 0.0
		for _, p := range arr(r["points"]) {
			points += num(p, "rps")
		}
		for _, s := range arr(r["shards"]) {
			shards += num(s, "requests")
		}
		for _, e := range arr(r["endpoints"]) {
			endpoints += num(e, "requests")
		}
		if points != num(m, "requests") || shards != points || endpoints != points {
			t.Fatalf("fixture %s inconsistent: %v %v %v %v", str(r, "id"), m["requests"], points, shards, endpoints)
		}
	}
	// Standalone checks run once per worker iteration, independent of node count.
	scene := clone(w.find("scenarios", "scn_checkout"))
	scene["mode"] = "script"
	scene["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": `import http from 'perfman/http'; import {check} from 'perfman'; export default function(){http.get('https://api.acme.internal/catalog'); check('Standalone',()=>true);}`}}
	r, err := w.createRun(scene, Obj{"kind": "load"}, w.data["users"][0])
	if err != nil {
		t.Fatal(err)
	}
	if err = w.allocateRun(r); err != nil {
		t.Fatal(err)
	}
	r["status"] = "running"
	r["startedAt"] = time.Now().Add(-3 * time.Second).UTC().Format(time.RFC3339Nano)
	w.advanceRun(r)
	m := obj(r["metrics"])
	if math.Abs(num(m, "requests")-num(m, "checks")) > float64(len(arr(r["shards"]))) {
		t.Fatal("check counts multiplied by workers", m)
	}
	if num(m, "iterations") != num(m, "requests") {
		t.Fatal("iterations divided by workers", m)
	}
}

func TestWorkspaceJMeterThroughputCap(t *testing.T) {
	content := `<jmeterTestPlan><hashTree><ThreadGroup testname="Users"><stringProp name="ThreadGroup.num_threads">4</stringProp></ThreadGroup><hashTree><ConstantThroughputTimer><doubleProp><name>throughput</name><value>600</value></doubleProp><intProp name="calcMode">1</intProp></ConstantThroughputTimer><HTTPSamplerProxy testname="Catalog"/></hashTree></hashTree></jmeterTestPlan>`
	_, groups, err := parseJMX(content)
	if err != nil || num(groups[0], "throughputRps") != 10 {
		t.Fatal(groups, err)
	}
	scene := Obj{"mode": "jmeter", "jmxId": "f"}
	run := Obj{"_files": []Obj{{"id": "f", "content": content}}}
	if jmeterRateLimit(scene, run, 0) != 10 {
		t.Fatal("group throughput cap")
	}
	run["_files"] = []Obj{{"id": "f", "content": strings.Replace(content, `name="calcMode">1`, `name="calcMode">0`, 1)}}
	if jmeterRateLimit(scene, run, 0) != 40 {
		t.Fatal("thread throughput cap")
	}
}

func TestWorkspaceStatefulFixturesAndHostBoundary(t *testing.T) {
	w, _, _ := workspaceFixture(t)
	scene := clone(w.find("scenarios", "scn_mixed"))
	scene["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": `import sql from 'perfman/sql'; import redis from 'perfman/redis'; import {check} from 'perfman'; const db=new sql.Database('sqlite','fixture'); const cache=new redis.Client(); export default function(){db.exec("INSERT INTO users VALUES(?, ?, ?)",3,'Morgan',29); const rows=db.query('SELECT name FROM users WHERE id=?',3); check('SQL write visible',()=>rows[0].name==='Morgan');cache.lpush('queue','first','second');check('Redis list order',()=>cache.lpop('queue')==='second');cache.sadd('members','a','a','b');check('Redis unique set',()=>cache.spop('members')!==null);}`}}
	result := w.evaluate(scene, Obj{"id": "validation", "source": "simulated"})
	if !flag(result, "valid") {
		t.Fatal(result)
	}
	for _, c := range arr(result["checks"]) {
		if !flag(c, "passed") {
			t.Fatal(c)
		}
	}
	path := filepath.Join(t.TempDir(), "forbidden.db")
	scene["scripts"] = []Obj{{"name": "main.js", "weight": 100, "content": `import sql from 'perfman/sql'; export default function(){const db=new sql.Database('sqlite','fixture'); db.exec("ATTACH DATABASE '` + path + `' AS external");}`}}
	result = w.evaluate(scene, Obj{"id": "validation", "source": "simulated"})
	if flag(result, "valid") {
		t.Fatal("SQL fixture allowed host database attachment")
	}
	for _, name := range []string{"../escape.proto", "/absolute.proto", "nested/ok.proto"} {
		var buffer bytes.Buffer
		z := zip.NewWriter(&buffer)
		file, _ := z.Create(name)
		file.Write([]byte(`syntax = "proto3";`))
		z.Close()
		err := unpackProtocols(Obj{"content": base64.StdEncoding.EncodeToString(buffer.Bytes())})
		if name == "nested/ok.proto" && err != nil {
			t.Fatal(err)
		}
		if name != "nested/ok.proto" && err == nil {
			t.Fatal("unsafe archive accepted", name)
		}
	}
}
