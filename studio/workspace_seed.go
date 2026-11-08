package studio

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"math"
	"time"
)

func defaultStep(protocol string) Obj {
	url, method, body, expect := "https://api.acme.internal/v1/catalog", "GET", "", 200
	switch protocol {
	case "gRPC":
		url = "catalog.v1.Catalog/GetProduct"
		method = "INVOKE"
		body = `{"id":"sku-1042"}`
		expect = 0
	case "WebSocket":
		url = "wss://stream.acme.internal/events"
		method = "SEND"
		body = `{"event":"subscribe","channel":"orders"}`
		expect = 101
	case "Socket.IO":
		url = "https://events.acme.internal/orders"
		method = "EMIT"
		body = `{"event":"order.created","data":{"id":"ord-1042"}}`
	case "SQL":
		url = "postgres://orders.internal/commerce"
		method = "QUERY"
		body = "SELECT id, total FROM orders WHERE status = 'paid' LIMIT 20"
	case "Redis":
		url = "redis://cache.internal:6379/0"
		method = "GET"
		body = "product:1042"
	case "TCP":
		url = "tcp://gateway.internal:9090"
		method = "EXCHANGE"
		body = "PING\n"
	case "UDP":
		url = "udp://telemetry.internal:8125"
		method = "SEND"
		body = "orders.completed:1|c"
	case "Protobuf":
		url = "catalog.Product"
		method = "ROUNDTRIP"
		body = `{"id":"sku-1042","name":"Studio desk"}`
	}
	return Obj{"name": protocol + " request", "protocol": protocol, "method": method, "url": url, "body": body, "headers": Obj{}, "extracts": []Obj{}, "checks": []Obj{{"name": "Response is valid", "type": "status", "operator": "eq", "expected": expect}}}
}
func sceneDefaults(name, pid, protocol, mode string) Obj {
	return Obj{"name": name, "projectId": pid, "description": "Performance coverage for the " + name + " service.", "mode": mode, "protocol": protocol, "engine": "simulator", "profile": "normal", "loadModel": "ramp", "vus": 120, "duration": 30, "rps": 300, "maxRps": 2000, "thinkMs": 200, "groupId": "grp_global", "environmentId": "env_staging", "network": "public", "regions": []Obj{{"region": "us-east-1", "percent": 50}, {"region": "eu-west-1", "percent": 30}, {"region": "ap-southeast-1", "percent": 20}}, "fileIds": []string{}, "steps": []Obj{defaultStep(protocol)}, "scripts": []Obj{{"name": "main.js", "weight": 100, "content": scriptTemplate(protocol)}}, "options": Obj{"timeoutMs": 3000, "keepAlive": true, "http2": false, "maxRedirects": 0, "setupTimeout": 10, "teardownTimeout": 10, "dns": Obj{}}, "sla": []Obj{{"id": "latency", "metric": "p95", "operator": "gt", "threshold": 400, "windows": 3, "stop": true, "notify": true}, {"id": "errors", "metric": "errorRate", "operator": "gt", "threshold": 2, "windows": 3, "stop": true, "notify": true}}, "contactId": "contact_platform", "tags": []string{"tier:critical"}, "version": 1}
}
func scriptTemplate(protocol string) string {
	switch protocol {
	case "HTTP":
		return `import http from 'perfman/http';
import { check, sleep, env, metadata } from 'perfman';
export function setup() { return { token: 'workspace-token' }; }
export default function(data) {
  const response = http.get(env().BASE_URL + '/v1/catalog');
  check('HTTP 200', () => response.status === 200, response);
  check('Product identifier exists', () => response.json().id !== undefined, response);
  console.log('Iteration completed', metadata().region);
  sleep(0.2);
}
export function teardown() { console.log('Cleanup completed'); }`
	case "gRPC":
		return `import grpc from 'perfman/grpc';
import { check } from 'perfman';
export default function() {
  const client = new grpc.Client();
  client.load([], 'catalog.proto');
  client.connect('catalog.internal:50051', {insecure:true});
  const result = client.invoke('catalog.v1.Catalog/GetProduct', {id:'sku-1042'});
  check('RPC completed', () => result.status === 0, result);
  client.close();
}`
	case "WebSocket":
		return `import ws from 'perfman/ws';
import { check } from 'perfman';
export default function() {
  const result = ws.connect('wss://stream.acme.internal/events', socket => {
    socket.on('message', message => console.log(message));
    socket.send(JSON.stringify({event:'subscribe', channel:'orders'}));
    socket.ping();
    socket.close();
  });
  check('Connection upgraded', () => result.status === 101, result);
}`
	case "SQL":
		return `import sql from 'perfman/sql';
import { check } from 'perfman';
const db = new sql.Database('postgres', 'orders.internal/commerce');
export default function() {
  const rows = db.query("SELECT id, total FROM orders WHERE status = 'paid' LIMIT 20");
  check('Orders returned', () => rows.length > 0);
}`
	case "Redis":
		return `import redis from 'perfman/redis';
import { check } from 'perfman';
const client = new redis.Client('redis://cache.internal:6379/0');
export default function() {
  client.set('product:1042', 'Studio desk');
  const value = client.get('product:1042');
  check('Cached value is correct', () => value === 'Studio desk');
  client.del('product:1042');
}`
	case "Socket.IO":
		return `import io from 'perfman/socketio';
import { check } from 'perfman';
export default function() {
  const connection = io.connect('https://events.acme.internal', {transport:'websocket',namespace:'/orders'}, socket => {
    socket.on('order.created', event => console.log(event));
    socket.emit('order.create', {sku:'1042'}, ack => check('Event acknowledged', () => ack.ok));
    socket.close();
  });
  check('Connected', () => connection.status === 200);
}`
	case "Protobuf":
		return `import protobuf from 'perfman/protobuf';
import { check } from 'perfman';
protobuf.load([], 'catalog.proto');
export default function() {
  const bytes = protobuf.marshal('catalog.Product', {id:'sku-1042',name:'Studio desk'});
  const result = protobuf.unmarshal('catalog.Product', bytes);
  check('Round trip preserves identifier', () => result.id === 'sku-1042');
}`
	default:
		return fmt.Sprintf(`import socket from 'perfman/socket';
import { check } from 'perfman';
export default function() {
  const connection = new socket.Conn('%s', 'gateway.internal:9090');
  const written = connection.write('PING');
  const result = connection.read(64);
  check('Reply received', () => result.length > 0);
  connection.close();
}`, protocol)
	}
}
func (w *Workspace) seedWorkspace() {
	password := osSeedPassword()
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	for _, u := range []Obj{{"id": "usr_alex", "name": "Alex Morgan", "email": "alex.morgan@acme.io", "role": "admin", "projects": []string{"prj_commerce", "prj_platform", "prj_edge"}}, {"id": "usr_jamie", "name": "Jamie Taylor", "email": "jamie.taylor@acme.io", "role": "engineer", "projects": []string{"prj_commerce", "prj_platform"}}, {"id": "usr_riley", "name": "Riley Chen", "email": "riley.chen@acme.io", "role": "operator", "projects": []string{"prj_commerce", "prj_platform", "prj_edge"}}, {"id": "usr_casey", "name": "Casey Lee", "email": "casey.lee@acme.io", "role": "viewer", "projects": []string{"prj_commerce"}}} {
		u["passwordHash"] = string(hash)
		u["status"] = "active"
		u["language"] = "en"
		w.push("users", u)
	}
	for _, p := range []Obj{{"id": "prj_commerce", "name": "Commerce", "description": "Checkout, catalog and order fulfilment", "color": "#7565d5", "tags": []string{"team:commerce", "tier:critical"}}, {"id": "prj_platform", "name": "Platform", "description": "Internal services and data infrastructure", "color": "#219586", "tags": []string{"team:platform"}}, {"id": "prj_edge", "name": "Edge network", "description": "Realtime gateways and client connections", "color": "#bf8052", "tags": []string{"team:edge"}}} {
		p["version"] = 1
		w.push("projects", p)
	}
	for _, e := range []Obj{{"id": "env_staging", "projectId": "prj_commerce", "name": "Staging", "description": "Pre-release validation", "variables": []Obj{{"name": "BASE_URL", "value": "https://staging.api.acme.internal", "secret": false}, {"name": "API_TOKEN", "value": w.encrypt("acme-test-key-2026"), "secret": true}}}, {"id": "env_platform", "projectId": "prj_platform", "name": "Integration", "description": "Internal platform services", "variables": []Obj{{"name": "BASE_URL", "value": "https://platform.acme.internal", "secret": false}}}, {"id": "env_edge", "projectId": "prj_edge", "name": "Preview", "description": "Realtime edge validation", "variables": []Obj{{"name": "BASE_URL", "value": "https://edge.acme.internal", "secret": false}}}} {
		e["version"] = 1
		w.push("environments", e)
	}
	for _, g := range []Obj{{"id": "grp_global", "name": "Global performance", "description": "Multi-region load generation", "provider": "simulator", "regions": []string{"us-east-1", "eu-west-1", "ap-southeast-1"}, "autoscale": true, "maxNodes": 12, "nodeCapacity": 1000, "maxParallel": 6}, {"id": "grp_private", "name": "Private services", "description": "Internal network and data services", "provider": "simulator", "regions": []string{"us-east-1"}, "autoscale": true, "maxNodes": 6, "nodeCapacity": 1000, "maxParallel": 4}, {"id": "grp_edge", "name": "Edge delivery", "description": "Persistent connections and gateways", "provider": "simulator", "regions": []string{"us-east-1", "eu-west-1", "ap-southeast-1"}, "autoscale": true, "maxNodes": 9, "nodeCapacity": 1500, "maxParallel": 4}} {
		g["version"] = 1
		w.push("groups", g)
		regions := stringsOf(g["regions"])
		for i := 0; i < 6; i++ {
			region := regions[i%len(regions)]
			w.push("resources", Obj{"id": fmt.Sprintf("node_%s_%02d", str(g, "id"), i+1), "name": fmt.Sprintf("%s-%02d", map[string]string{"grp_global": "atlas", "grp_private": "nexus", "grp_edge": "relay"}[str(g, "id")], i+1), "groupId": str(g, "id"), "provider": "simulator", "region": region, "address": fmt.Sprintf("10.%d.%d.%d", 20+len(w.data["groups"]), i/3, 10+i), "status": "ready", "capacity": num(g, "nodeCapacity"), "allocated": 0, "cpu": 7 + i%4, "memory": 21 + i%9, "heartbeatAt": now(), "engine": "native, script, jmeter", "version": 1, "tags": []string{"managed:true"}})
		}
	}
	w.push("contacts", Obj{"id": "contact_platform", "name": "Performance on-call", "projectId": "prj_commerce", "email": "performance@acme.io", "channel": "inbox", "description": "Release quality notifications", "version": 1})
	for _, tag := range []string{"team:commerce", "team:platform", "team:edge", "tier:critical", "release:2026.11", "owner:alex"} {
		w.push("tags", Obj{"name": tag, "version": 1})
	}
	w.push("files", Obj{"id": "file_users", "projectId": "prj_commerce", "name": "customers.csv", "type": "parameter", "content": "customerId,email,segment\nc-1042,avery@example.com,enterprise\nc-1043,jordan@example.com,growth\nc-1044,taylor@example.com,starter\n", "version": 1, "size": 149, "columns": []string{"customerId", "email", "segment"}})
	w.push("files", Obj{"id": "file_proto", "projectId": "prj_commerce", "name": "catalog.proto", "type": "protocol", "content": "syntax = \"proto3\";\npackage catalog;\nmessage Product { string id = 1; string name = 2; }\nservice Catalog { rpc GetProduct(Product) returns (Product); }\n", "version": 1, "size": 162})
	jmx := `<?xml version="1.0"?><jmeterTestPlan><hashTree><TestPlan testname="Checkout regression"/><hashTree><ThreadGroup testname="Browsing users"><stringProp name="ThreadGroup.num_threads">40</stringProp></ThreadGroup><hashTree><HTTPSamplerProxy testname="Catalog lookup"><stringProp name="HTTPSampler.domain">api.acme.internal</stringProp><stringProp name="HTTPSampler.path">/v1/catalog</stringProp><stringProp name="HTTPSampler.method">GET</stringProp></HTTPSamplerProxy><hashTree/></hashTree><ThreadGroup testname="Checkout users"><stringProp name="ThreadGroup.num_threads">60</stringProp></ThreadGroup><hashTree><HTTPSamplerProxy testname="Create order"><stringProp name="HTTPSampler.domain">api.acme.internal</stringProp><stringProp name="HTTPSampler.path">/v1/orders</stringProp><stringProp name="HTTPSampler.method">POST</stringProp></HTTPSamplerProxy><hashTree/></hashTree></hashTree></hashTree></jmeterTestPlan>`
	w.push("files", Obj{"id": "file_jmx", "projectId": "prj_commerce", "name": "checkout-regression.jmx", "type": "jmeter", "content": jmx, "version": 1, "size": len(jmx)})
	seeds := []Obj{}
	checkout := sceneDefaults("Checkout journey", "prj_commerce", "HTTP", "simple")
	checkout["id"] = "scn_checkout"
	checkout["description"] = "Authenticate, browse the catalog and complete an order."
	login := defaultStep("HTTP")
	login["name"] = "Authenticate customer"
	login["url"] = "https://api.acme.internal/v1/auth"
	login["method"] = "POST"
	login["body"] = `{"email":"${email}"}`
	login["extracts"] = []Obj{{"name": "token", "path": "$.token", "mode": "jsonpath"}}
	catalog := defaultStep("HTTP")
	catalog["name"] = "Browse catalog"
	order := defaultStep("HTTP")
	order["name"] = "Create order"
	order["url"] = "https://api.acme.internal/v1/orders"
	order["method"] = "POST"
	order["headers"] = Obj{"Authorization": "Bearer ${token}"}
	order["body"] = `{"sku":"sku-1042","customerId":"${customerId}"}`
	order["checks"] = []Obj{{"name": "Order created", "type": "status", "operator": "eq", "expected": 201}, {"name": "Order total is positive", "type": "json", "path": "$.total", "operator": "gt", "expected": 0}}
	checkout["steps"] = []Obj{login, catalog, order}
	checkout["fileIds"] = []string{"file_users"}
	seeds = append(seeds, checkout)
	for i, p := range []string{"gRPC", "WebSocket", "Redis", "SQL", "Socket.IO", "TCP", "UDP", "Protobuf", "HTTP"} {
		pid := "prj_platform"
		if has([]string{"WebSocket", "Socket.IO", "TCP", "UDP"}, p) {
			pid = "prj_edge"
		}
		if p == "gRPC" || p == "Protobuf" {
			pid = "prj_commerce"
		}
		s := sceneDefaults(map[string]string{"gRPC": "Catalog RPC throughput", "WebSocket": "Order stream connections", "Redis": "Product cache operations", "SQL": "Order analytics queries", "Socket.IO": "Live order events", "TCP": "Gateway round trips", "UDP": "Telemetry ingestion", "Protobuf": "Product schema round trip", "HTTP": "API release regression"}[p], pid, p, "script")
		s["id"] = fmt.Sprintf("scn_protocol_%d", i)
		if pid == "prj_platform" {
			s["environmentId"] = "env_platform"
			s["groupId"] = "grp_private"
			s["regions"] = []Obj{{"region": "us-east-1", "percent": 100}}
		}
		if pid == "prj_edge" {
			s["environmentId"] = "env_edge"
			s["groupId"] = "grp_edge"
		}
		if p == "gRPC" || p == "Protobuf" {
			s["fileIds"] = []string{"file_proto"}
		}
		seeds = append(seeds, s)
	}
	j := sceneDefaults("Checkout regression suite", "prj_commerce", "HTTP", "jmeter")
	j["id"] = "scn_jmeter"
	j["jmxId"] = "file_jmx"
	j["fileIds"] = []string{"file_jmx", "file_users"}
	j["threadMode"] = "parallel"
	j["loops"] = 20
	j["csvSplit"] = true
	j["logRequests"] = true
	j["logChecks"] = true
	seeds = append(seeds, j)
	mixed := sceneDefaults("Mixed commerce traffic", "prj_commerce", "HTTP", "script")
	mixed["id"] = "scn_mixed"
	mixed["scripts"] = []Obj{{"name": "browse.js", "weight": 70, "content": scriptTemplate("HTTP")}, {"name": "checkout.js", "weight": 30, "content": "import http from 'perfman/http';\nimport {check} from 'perfman';\nexport default function(){const r=http.post('https://api.acme.internal/v1/orders',{});check('Order created',()=>r.status===201,r);}"}}
	seeds = append(seeds, mixed)
	for _, s := range seeds {
		w.push("scenarios", s)
	}
	for i := 0; i < 18; i++ {
		s := seeds[i%len(seeds)]
		started := time.Now().Add(-time.Duration(2+i*3) * time.Hour)
		points := []Obj{}
		peak := num(s, "vus") * 2.3
		bad := i == 3 || i == 9
		for t := 0; t < 30; t++ {
			load := .3
			if t > 7 {
				load = .6
			}
			if t > 14 {
				load = 1
			}
			rps := peak * load * (1 + .04*math.Sin(float64(t)))
			lat := 64 + float64(i%5)*9 + 8*math.Sin(float64(t))
			if bad {
				lat *= 7
			}
			points = append(points, Obj{"second": t + 1, "rps": number(rps), "p95": number(lat), "errorRate": func() float64 {
				if bad {
					return 3.2
				}
				return 0
			}(), "vus": math.Round(num(s, "vus") * load), "cpu": number(20 + load*45), "memory": number(24 + load*14), "checkFailureRate": 0, "bytesIn": number(rps * 430), "bytesOut": number(rps * 180)})
		}
		p95 := 84 + float64(i%5)*9
		if bad {
			p95 = 594
		}
		status, verdict := "completed", "passed"
		if bad {
			status = "protected"
			verdict = "failed"
		}
		samples := []Obj{}
		ends := []Obj{}
		checks := []Obj{}
		for _, st := range arr(s["steps"]) {
			ends = append(ends, Obj{"name": str(st, "name"), "protocol": str(s, "protocol"), "requests": 1800, "errors": 0, "mean": number(p95 * .6), "p95": p95})
			samples = append(samples, Obj{"id": uid("sample"), "name": str(st, "name"), "protocol": str(s, "protocol"), "method": str(st, "method"), "url": str(st, "url"), "status": 200, "duration": p95 * .8, "requestBody": str(st, "body"), "responseBody": `{"ok":true,"id":"sku-1042"}`, "checks": []Obj{{"name": "Response is valid", "passed": true}}, "timing": Obj{"dns": 2, "connect": 5, "tls": 10, "send": 1, "wait": p95 * .6, "receive": 3}})
			checks = append(checks, Obj{"name": str(st, "name") + " successful", "total": 1800, "failed": 0, "passRate": 100})
		}
		run := Obj{"id": fmt.Sprintf("run_%05d", 2481-i), "name": str(s, "name"), "projectId": str(s, "projectId"), "scenarioId": str(s, "id"), "snapshot": clone(s), "status": status, "verdict": verdict, "source": "simulated", "kind": "load", "createdAt": started.UTC().Format(time.RFC3339), "startedAt": started.UTC().Format(time.RFC3339), "finishedAt": started.Add(30 * time.Second).UTC().Format(time.RFC3339), "elapsed": 30, "actor": "Alex Morgan", "metrics": Obj{"requests": 5400 + i*85, "errors": func() int {
			if bad {
				return 173
			}
			return 0
		}(), "rps": number(peak * .7), "p50": number(p95 * .58), "p95": p95, "p99": number(p95 * 1.3), "mean": number(p95 * .64), "errorRate": func() float64 {
			if bad {
				return 3.2
			}
			return 0
		}(), "checks": 5400, "checkFailures": 0, "checkFailureRate": 0, "iterations": 1800, "bytesIn": 2400000, "bytesOut": 970000, "dropped": 0}, "points": points, "endpoints": ends, "checks": checks, "samples": samples, "shards": []Obj{{"id": "shard-1", "region": "us-east-1", "workerId": "node_grp_global_01", "workerName": "atlas-01", "target": 60, "status": "completed", "requests": 2700, "epoch": 1}, {"id": "shard-2", "region": "eu-west-1", "workerId": "node_grp_global_02", "workerName": "atlas-02", "target": 36, "status": "completed", "requests": 1620, "epoch": 1}, {"id": "shard-3", "region": "ap-southeast-1", "workerId": "node_grp_global_03", "workerName": "atlas-03", "target": 24, "status": "completed", "requests": 1080, "epoch": 1}}, "events": []Obj{{"at": started.UTC().Format(time.RFC3339), "level": "info", "message": "Resource allocation completed across three regions."}, {"at": started.Add(time.Second).UTC().Format(time.RFC3339), "level": "info", "message": "All workers ready. Start barrier released."}, {"at": started.Add(30 * time.Second).UTC().Format(time.RFC3339), "level": "info", "message": "Run finalised. Resources released."}}, "logs": []Obj{{"level": "info", "source": "engine", "message": "All scenarios completed successfully.", "at": started.UTC().Format(time.RFC3339)}}, "baseline": i == 0}
		w.push("runs", run)
	}
	w.push("recordings", Obj{"id": "record_checkout", "name": "Customer checkout session", "projectId": "prj_commerce", "format": "browser", "status": "captured", "requests": clone(arr(checkout["steps"])), "filter": "api.acme.internal", "version": 1})
	w.push("integrations", Obj{"name": "Workspace notification inbox", "type": "inbox", "status": "connected", "endpoint": "workspace://notifications", "version": 1})
	w.push("alerts", Obj{"name": "Latency budget exceeded", "projectId": "prj_commerce", "runId": "run_02478", "scenarioId": "scn_protocol_2", "severity": "warning", "metric": "p95", "value": 594, "threshold": 400, "status": "open", "stopStatus": "completed", "deliveryStatus": "delivered", "createdAt": time.Now().Add(-11 * time.Hour).UTC().Format(time.RFC3339)})
	w.push("deliveries", Obj{"name": "Performance alert", "projectId": "prj_commerce", "channel": "inbox", "recipient": "Performance on-call", "status": "delivered", "subject": "Performance target exceeded", "body": "Checkout regression exceeded the P95 latency target. The run was stopped.", "attempts": 1, "createdAt": time.Now().Add(-11 * time.Hour).UTC().Format(time.RFC3339)})
	w.audit(w.data["users"][0], "workspace.initialised", "Acme Engineering")
}
