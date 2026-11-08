package studio

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/robfig/cron/v3"
	"math"
	"sort"
	"strings"
	"time"
)

func nextOccurrences(o Obj, after time.Time, n int) ([]string, error) {
	out := []string{}
	loc, err := time.LoadLocation(str(o, "timezone"))
	if err != nil {
		return nil, err
	}
	if str(o, "frequency") == "once" {
		t, err := time.Parse(time.RFC3339, str(o, "nextAt"))
		if err != nil || !t.After(after) {
			return nil, errors.New("invalid_schedule")
		}
		return []string{t.UTC().Format(time.RFC3339)}, nil
	}
	spec := str(o, "cron")
	schedule, err := cron.ParseStandard("CRON_TZ=" + loc.String() + " " + spec)
	if err != nil {
		return nil, err
	}
	t := after
	for i := 0; i < n; i++ {
		t = schedule.Next(t)
		if t.IsZero() {
			return nil, errors.New("invalid_schedule")
		}
		out = append(out, t.UTC().Format(time.RFC3339))
	}
	return out, nil
}
func (w *Workspace) addRunEvent(r Obj, level, message string) {
	events := arr(r["events"])
	events = append(events, Obj{"at": now(), "level": level, "message": message})
	if len(events) > 100 {
		events = events[len(events)-100:]
	}
	r["events"] = events
}
func (w *Workspace) createRun(scene, input, user Obj) (Obj, error) {
	if w.closed {
		return nil, errors.New("service_stopping")
	}
	if !w.policyAllowed(user, "runs.write", scene) {
		return nil, errors.New("permission_denied")
	}
	if err := w.validateScenario(scene); err != nil {
		return nil, err
	}
	key := str(input, "idempotencyKey")
	if key != "" {
		for _, r := range w.data["runs"] {
			if str(r, "idempotencyKey") == key && str(r, "actorId") == str(user, "id") {
				return r, nil
			}
		}
	}
	snapshot := clone(scene)
	if str(input, "kind") == "debug" {
		snapshot["vus"] = 1
		snapshot["duration"] = 3
		snapshot["loadModel"] = "constant"
		snapshot["regions"] = []Obj{arr(scene["regions"])[0]}
		arr(snapshot["regions"])[0]["percent"] = 100
	}
	r := Obj{"id": uid("run"), "name": str(scene, "name"), "projectId": str(scene, "projectId"), "scenarioId": str(scene, "id"), "snapshot": snapshot, "source": "simulated", "kind": str(input, "kind"), "status": "queued", "verdict": "pending", "createdAt": now(), "actor": str(user, "name"), "actorId": str(user, "id"), "idempotencyKey": key, "elapsed": 0, "targetRps": num(scene, "rps"), "loadRevision": 1, "events": []Obj{}, "logs": []Obj{}, "points": []Obj{}, "samples": []Obj{}, "checks": []Obj{}, "endpoints": []Obj{}, "shards": []Obj{}, "metrics": Obj{"requests": 0, "errors": 0, "checks": 0, "checkFailures": 0, "rps": 0, "p50": 0, "p95": 0, "p99": 0, "mean": 0, "errorRate": 0, "checkFailureRate": 0, "iterations": 0, "bytesIn": 0, "bytesOut": 0, "dropped": 0}, "_hist": Obj{}, "_rules": Obj{}, "_endpoints": Obj{}, "_checks": Obj{}, "_files": []Obj{}}
	if str(snapshot, "engine") == "native" {
		r["source"] = "measured"
	}
	if str(r, "kind") == "" {
		r["kind"] = "load"
	}
	for _, fid := range stringsOf(scene["fileIds"]) {
		if f := w.find("files", fid); f != nil {
			r["_files"] = append(arr(r["_files"]), clone(f))
		}
	}
	if env := w.find("environments", str(scene, "environmentId")); env != nil {
		r["_environment"] = clone(env)
	}
	probe := clone(r)
	probe["id"] = "validation"
	result := w.evaluate(snapshot, probe)
	if !flag(result, "valid") {
		return nil, fmt.Errorf("script_invalid: %s", str(result, "error"))
	}
	r["_preview"] = result
	w.addRunEvent(r, "info", "Run queued. Scenario and file versions have been frozen.")
	w.push("runs", r)
	w.audit(user, "run.create", str(r, "id"))
	if len(w.data["runs"]) > 200 {
		for i, old := range w.data["runs"] {
			if terminalState(str(old, "status")) && !flag(old, "baseline") {
				w.data["runs"] = append(w.data["runs"][:i], w.data["runs"][i+1:]...)
				break
			}
		}
	}
	return r, nil
}
func splitBudget(total int, regions []Obj) []int {
	out := make([]int, len(regions))
	fractions := make([]float64, len(regions))
	sum := 0
	for i, r := range regions {
		exact := float64(total) * num(r, "percent") / 100
		out[i] = int(math.Floor(exact))
		fractions[i] = exact - float64(out[i])
		sum += out[i]
	}
	for sum < total {
		best := 0
		for i := range fractions {
			if fractions[i] > fractions[best] {
				best = i
			}
		}
		out[best]++
		fractions[best] = -1
		sum++
	}
	return out
}
func (w *Workspace) allocateRun(r Obj) error {
	scene := obj(r["snapshot"])
	g := w.find("groups", str(scene, "groupId"))
	if g == nil {
		return errors.New("group_not_found")
	}
	parallel := 0
	for _, other := range w.data["runs"] {
		if str(other, "id") != str(r, "id") && !terminalState(str(other, "status")) && str(other, "status") != "queued" && str(obj(other["snapshot"]), "groupId") == str(g, "id") {
			parallel++
		}
	}
	if parallel >= int(num(g, "maxParallel")) {
		return errors.New("queue_busy")
	}
	regions := arr(scene["regions"])
	total := int(num(scene, "vus"))
	if str(scene, "loadModel") == "rps" {
		total = max(1, int(math.Ceil(num(scene, "maxRps")*.05)))
	}
	if str(r, "kind") == "debug" {
		total = 1
	}
	budgets := splitBudget(total, regions)
	allocations := []Obj{}
	for i, region := range regions {
		remaining := budgets[i]
		nodes := []Obj{}
		nodeCount := 0
		for _, node := range w.data["resources"] {
			if str(node, "groupId") == str(g, "id") {
				nodeCount++
				if str(node, "region") == str(region, "region") && str(node, "status") == "ready" {
					nodes = append(nodes, node)
				}
			}
		}
		sort.Slice(nodes, func(i, j int) bool { return num(nodes[i], "allocated") < num(nodes[j], "allocated") })
		for _, node := range nodes {
			take := min(remaining, int(num(node, "capacity")-num(node, "allocated")))
			if take > 0 {
				allocations = append(allocations, Obj{"node": node, "target": take, "region": str(region, "region")})
				remaining -= take
			}
			if remaining == 0 {
				break
			}
		}
		for remaining > 0 && flag(g, "autoscale") && nodeCount < int(num(g, "maxNodes")) {
			node := Obj{"id": uid("node"), "name": fmt.Sprintf("%s-%02d", strings.ReplaceAll(strings.ToLower(str(g, "name")), " ", "-"), nodeCount+1), "provider": "simulator", "groupId": str(g, "id"), "region": str(region, "region"), "address": fmt.Sprintf("10.32.%d.%d", i, nodeCount+20), "capacity": num(g, "nodeCapacity"), "status": "ready", "allocated": 0, "cpu": 3, "memory": 18, "heartbeatAt": now(), "engine": "native, script, jmeter", "version": 1, "elastic": true}
			w.push("resources", node)
			nodeCount++
			take := min(remaining, int(num(node, "capacity")))
			allocations = append(allocations, Obj{"node": node, "target": take, "region": str(region, "region")})
			remaining -= take
			w.addRunEvent(r, "info", "Autoscaled resource "+str(node, "name")+" in "+str(region, "region"))
		}
		if remaining > 0 {
			return fmt.Errorf("capacity_unavailable: %s requires %d additional VUs", str(region, "region"), remaining)
		}
	}
	shards := []Obj{}
	for i, alloc := range allocations {
		node := obj(alloc["node"])
		target := num(alloc, "target")
		node["allocated"] = num(node, "allocated") + target
		pod := Obj{"id": uid("pod"), "name": fmt.Sprintf("load-%s-%02d", str(r, "id")[4:10], i+1), "runId": str(r, "id"), "projectId": str(r, "projectId"), "groupId": str(g, "id"), "resourceId": str(node, "id"), "workerName": str(node, "name"), "region": str(alloc, "region"), "provider": str(node, "provider"), "status": "creating", "namespace": "perfman-runs", "clusterId": node["clusterId"], "image": "perfman/engine:1.0", "cpuLimit": 2, "memoryLimit": 2048, "cpu": 0, "memory": 0, "target": target, "version": 1}
		w.push("pods", pod)
		shards = append(shards, Obj{"id": fmt.Sprintf("shard-%02d", i+1), "workerId": str(node, "id"), "workerName": str(node, "name"), "podId": str(pod, "id"), "region": str(alloc, "region"), "target": target, "status": "preparing", "epoch": 1, "heartbeatAt": now(), "leaseExpiresAt": time.Now().Add(15 * time.Second).UTC().Format(time.RFC3339), "requests": 0})
	}
	r["shards"] = shards
	w.addRunEvent(r, "info", fmt.Sprintf("Reserved %d VUs across %d workers and %d regions.", total, len(shards), len(regions)))
	return nil
}
func (w *Workspace) releaseRun(r Obj) {
	if flag(r, "_released") {
		return
	}
	for _, shard := range arr(r["shards"]) {
		if node := w.find("resources", str(shard, "workerId")); node != nil {
			node["allocated"] = math.Max(0, num(node, "allocated")-num(shard, "target"))
		}
		if pod := w.find("pods", str(shard, "podId")); pod != nil {
			pod["status"] = "terminated"
			pod["finishedAt"] = now()
			pod["cpu"] = 0
		}
		if str(shard, "status") != "failed" {
			shard["status"] = "completed"
		}
		shard["finishedAt"] = now()
	}
	r["_released"] = true
}
func (w *Workspace) finishRun(r Obj, state, verdict, reason string) {
	if terminalState(str(r, "status")) {
		return
	}
	w.teardownScripts(r)
	r["status"] = state
	r["verdict"] = verdict
	r["finishedAt"] = now()
	w.addRunEvent(r, "info", reason)
	w.releaseRun(r)
	w.addRunEvent(r, "info", "All worker allocations released. Report finalised.")
	w.notify(r, "Run "+state, reason)
	for _, occ := range w.data["occurrences"] {
		if str(occ, "runId") == str(r, "id") {
			occ["status"] = state
			occ["finishedAt"] = now()
		}
	}
}
func (w *Workspace) notify(r Obj, subject, body string) {
	scene := obj(r["snapshot"])
	contact := w.find("contacts", str(scene, "contactId"))
	recipient, channel := "Workspace inbox", "inbox"
	if contact != nil {
		recipient = str(contact, "name")
		if str(contact, "channel") != "" {
			channel = str(contact, "channel")
		}
	}
	status := "delivered"
	if channel != "inbox" {
		status = "simulated"
	}
	w.push("deliveries", Obj{"name": subject, "projectId": str(r, "projectId"), "runId": str(r, "id"), "subject": subject + ": " + str(r, "name"), "body": body, "recipient": recipient, "channel": channel, "status": status, "attempts": 1})
}
func loadFactor(scene Obj, elapsed float64) float64 {
	d := num(scene, "duration")
	switch str(scene, "loadModel") {
	case "ramp":
		if elapsed < d*.25 {
			return .25
		}
		if elapsed < d*.5 {
			return .5
		}
	case "spike":
		if elapsed < d*.35 || elapsed > d*.7 {
			return .2
		}
	}
	return 1
}
func histogramQ(hist Obj, q float64) float64 {
	total := 0.0
	keys := []int{}
	for k, v := range hist {
		total += num(Obj{"v": v}, "v")
		keys = append(keys, parseInt(k))
	}
	sort.Ints(keys)
	target := math.Ceil(total * q)
	sum := 0.0
	for _, k := range keys {
		sum += num(hist, fmt.Sprint(k))
		if sum >= target && target > 0 {
			return float64(k)
		}
	}
	return 0
}
func addHist(hist Obj, latency float64, count float64) {
	key := fmt.Sprint(int(math.Ceil(latency)))
	hist[key] = num(hist, key) + count
}
func (w *Workspace) advanceRun(r Obj) {
	scene := obj(r["snapshot"])
	elapsed := secondsSince(str(r, "startedAt"))
	r["elapsed"] = number(elapsed)
	if elapsed >= num(scene, "duration") || str(r, "kind") == "debug" && elapsed >= 1.2 || str(scene, "mode") == "jmeter" && str(scene, "threadMode") != "serial" && num(scene, "loops") > 0 && num(obj(r["metrics"]), "iterations") >= num(scene, "loops")*num(scene, "vus") {
		m := obj(r["metrics"])
		verdict := "passed"
		if num(m, "requests") == 0 {
			verdict = "inconclusive"
		}
		for _, rule := range arr(scene["sla"]) {
			if ruleFails(num(m, str(rule, "metric")), rule) {
				verdict = "failed"
			}
		}
		w.finishRun(r, "completed", verdict, "Execution completed.")
		return
	}
	for _, shard := range arr(r["shards"]) {
		node := w.find("resources", str(shard, "workerId"))
		if node == nil || str(node, "status") == "offline" {
			shard["status"] = "failed"
			w.finishRun(r, "partial", "inconclusive", "Worker heartbeat lost: "+str(shard, "workerName"))
			return
		}
		shard["heartbeatAt"] = now()
		shard["leaseExpiresAt"] = time.Now().Add(15 * time.Second).UTC().Format(time.RFC3339)
	}
	result := w.evaluateShards(scene, r)
	samples := arr(result["samples"])
	checks := arr(result["checks"])
	logs := arr(result["logs"])
	if !flag(result, "valid") {
		w.finishRun(r, "failed", "failed", "Engine error: "+str(result, "error"))
		return
	}
	factor := loadFactor(scene, elapsed)
	iterationSeconds := num(result, "iterationSeconds")
	logicalRequests := num(result, "logicalRequests")
	if logicalRequests == 0 {
		logicalRequests = float64(len(samples))
	}
	if iterationSeconds <= 0 {
		iterationSeconds = num(scene, "thinkMs")/1000 + num(result, "sleepSeconds")
		for _, sample := range samples {
			iterationSeconds += num(sample, "duration") / 1000
		}
	}
	target := num(scene, "vus") * logicalRequests / math.Max(.05, iterationSeconds) * factor
	if str(scene, "loadModel") == "rps" {
		target = num(r, "targetRps")
	}
	if limit := jmeterRateLimit(scene, r, elapsed); limit > 0 {
		target = math.Min(target, limit)
	}
	if str(r, "kind") == "debug" {
		target = float64(len(samples))
	}
	if len(samples) == 0 {
		target = 0
	}
	n := math.Round(target * (1 + .025*math.Sin(elapsed*1.1)))
	if str(scene, "engine") == "native" {
		n = float64(len(samples))
	}
	m := obj(r["metrics"])
	hist := obj(r["_hist"])
	windowHist := Obj{}
	errorsCount, checksCount, checksFailed, totalMS, inBytes, outBytes := 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
	ends := obj(r["_endpoints"])
	checkStats := obj(r["_checks"])
	sampleRegions := []Obj{}
	entryCounts := map[string]int{}
	entryWeights := map[string]float64{}
	for _, sample := range samples {
		entry := str(sample, "workerId") + "|" + str(sample, "script")
		entryCounts[entry]++
		share := num(sample, "workerShare")
		if share == 0 {
			share = 1
		}
		entryWeights[entry] = math.Max(1, num(sample, "scriptWeight")) * share
	}
	weightSum := 0.0
	for _, weight := range entryWeights {
		weightSum += weight
	}
	for _, sample := range samples {
		entry := str(sample, "workerId") + "|" + str(sample, "script")
		sampleRegions = append(sampleRegions, Obj{"percent": entryWeights[entry] / math.Max(1, weightSum) / float64(entryCounts[entry]) * 100})
	}
	sampleCounts := splitBudget(int(n), sampleRegions)
	sampleWeights := map[string]float64{}
	for i, sample := range samples {
		weight := float64(sampleCounts[i])
		sampleWeights[str(sample, "id")] = weight
		latency := num(sample, "duration")
		if str(scene, "engine") != "native" {
			latency *= 1 + .04*math.Sin(elapsed*.7+float64(i))
		}
		if weight == 0 {
			continue
		}
		failed := str(sample, "error") != "" || str(sample, "protocol") == "HTTP" && (num(sample, "status") == 0 || num(sample, "status") >= 400) || str(sample, "protocol") == "gRPC" && num(sample, "status") != 0
		if failed {
			errorsCount += weight
		}
		addHist(hist, latency, weight)
		addHist(windowHist, latency, weight)
		totalMS += latency * weight
		inBytes += float64(len(str(sample, "responseBody"))) * weight
		outBytes += float64(len(str(sample, "requestBody"))+120) * weight
		key := str(sample, "name")
		ep := obj(ends[key])
		if len(ep) == 0 {
			ep = Obj{"name": key, "protocol": str(sample, "protocol"), "requests": 0, "errors": 0, "_sum": 0, "_hist": Obj{}}
			ends[key] = ep
		}
		ep["requests"] = num(ep, "requests") + weight
		if failed {
			ep["errors"] = num(ep, "errors") + weight
		}
		ep["_sum"] = num(ep, "_sum") + latency*weight
		addHist(obj(ep["_hist"]), latency, weight)
		ep["mean"] = number(num(ep, "_sum") / math.Max(1, num(ep, "requests")))
		ep["p95"] = histogramQ(obj(ep["_hist"]), .95)
	}
	for _, c := range checks {
		weight := sampleWeights[str(c, "sampleId")]
		if str(c, "sampleId") == "" {
			entry := str(c, "workerId") + "|" + str(c, "script")
			weight = math.Round(n * entryWeights[entry] / math.Max(1, weightSum) / float64(max(1, entryCounts[entry])))
		}
		checksCount += weight
		cs := obj(checkStats[str(c, "name")])
		if len(cs) == 0 {
			cs = Obj{"name": str(c, "name"), "total": 0, "failed": 0}
			checkStats[str(c, "name")] = cs
		}
		cs["total"] = num(cs, "total") + weight
		if !flag(c, "passed") {
			checksFailed += weight
			cs["failed"] = num(cs, "failed") + weight
		}
		cs["passRate"] = number(100 * (1 - num(cs, "failed")/math.Max(1, num(cs, "total"))))
	}
	m["requests"] = num(m, "requests") + n
	m["errors"] = num(m, "errors") + errorsCount
	m["checks"] = num(m, "checks") + checksCount
	m["checkFailures"] = num(m, "checkFailures") + checksFailed
	m["errorRate"] = number(num(m, "errors") / math.Max(1, num(m, "requests")) * 100)
	m["checkFailureRate"] = number(num(m, "checkFailures") / math.Max(1, num(m, "checks")) * 100)
	m["rps"] = number(num(m, "requests") / math.Max(1, elapsed))
	m["_sum"] = num(m, "_sum") + totalMS
	m["mean"] = number(num(m, "_sum") / math.Max(1, num(m, "requests")))
	m["p50"] = histogramQ(hist, .5)
	m["p95"] = histogramQ(hist, .95)
	m["p99"] = histogramQ(hist, .99)
	m["bytesIn"] = num(m, "bytesIn") + inBytes
	m["bytesOut"] = num(m, "bytesOut") + outBytes
	m["iterations"] = num(m, "iterations") + math.Round(n/math.Max(1, logicalRequests))
	endsArray := []Obj{}
	for _, v := range ends {
		copy := clone(obj(v))
		delete(copy, "_hist")
		delete(copy, "_sum")
		endsArray = append(endsArray, copy)
	}
	sort.Slice(endsArray, func(i, j int) bool { return str(endsArray[i], "name") < str(endsArray[j], "name") })
	r["endpoints"] = endsArray
	ca := []Obj{}
	for _, v := range checkStats {
		ca = append(ca, obj(v))
	}
	r["checks"] = ca
	r["samples"] = samples
	r["logs"] = append(arr(r["logs"]), logs...)
	r["logs"] = append(arr(r["logs"]), Obj{"at": now(), "level": "info", "source": "engine", "message": fmt.Sprintf("Window %.0f: %.0f requests, %.0f ms P95, %d healthy shards", math.Floor(elapsed), n, histogramQ(windowHist, .95), len(arr(r["shards"])))})
	if len(arr(r["logs"])) > 120 {
		r["logs"] = arr(r["logs"])[len(arr(r["logs"]))-120:]
	}
	points := arr(r["points"])
	points = append(points, Obj{"second": number(elapsed), "rps": n, "targetRps": target, "p95": histogramQ(windowHist, .95), "mean": number(totalMS / math.Max(n, 1)), "errorRate": number(errorsCount / math.Max(1, n) * 100), "checkFailureRate": number(checksFailed / math.Max(1, checksCount) * 100), "vus": math.Round(num(scene, "vus") * factor), "cpu": number(15 + factor*49), "memory": number(24 + factor*15), "bytesIn": inBytes, "bytesOut": outBytes})
	r["points"] = points
	w.recordSeries(r, samples, sampleWeights, elapsed, points[len(points)-1])
	shards := arr(r["shards"])
	sumTargets := 0.0
	for _, shard := range shards {
		sumTargets += num(shard, "target")
	}
	shardRegions := []Obj{}
	for _, shard := range shards {
		shardRegions = append(shardRegions, Obj{"percent": num(shard, "target") / math.Max(1, sumTargets) * 100})
	}
	shardCounts := splitBudget(int(n), shardRegions)
	for i, shard := range shards {
		shard["requests"] = num(shard, "requests") + float64(shardCounts[i])
		shard["loadRevision"] = r["loadRevision"]
		if pod := w.find("pods", str(shard, "podId")); pod != nil {
			pod["cpu"] = number(factor*55 + 8)
			pod["memory"] = number(240 + factor*180)
		}
	}
	if str(r, "kind") == "debug" {
		return
	}
	ruleCounts := obj(r["_rules"])
	last := points[len(points)-1]
	last["requests"] = n
	last["p99"] = histogramQ(windowHist, .99)
	if elapsed >= 2 && n >= 5 {
		for _, rule := range arr(scene["sla"]) {
			key := str(rule, "id")
			if key == "" {
				key = str(rule, "metric")
			}
			if ruleFails(num(last, str(rule, "metric")), rule) {
				ruleCounts[key] = num(ruleCounts, key) + 1
			} else {
				ruleCounts[key] = 0
			}
			if num(ruleCounts, key) >= num(rule, "windows") && !flag(obj(r["_triggered"]), key) {
				if r["_triggered"] == nil {
					r["_triggered"] = Obj{}
				}
				obj(r["_triggered"])[key] = true
				message := fmt.Sprintf("%s %.2f exceeded the %.2f target for %.0f windows.", str(rule, "metric"), num(last, str(rule, "metric")), num(rule, "threshold"), num(rule, "windows"))
				alert := Obj{"name": "Performance target exceeded", "projectId": r["projectId"], "runId": r["id"], "scenarioId": r["scenarioId"], "metric": str(rule, "metric"), "value": num(last, str(rule, "metric")), "threshold": num(rule, "threshold"), "status": "open", "severity": "warning", "stopStatus": "not_requested", "deliveryStatus": "not_requested"}
				if flag(rule, "notify") {
					w.notify(r, "Performance target exceeded", message)
					alert["deliveryStatus"] = "delivered"
				}
				w.addRunEvent(r, "warning", message)
				if flag(rule, "stop") {
					alert["stopStatus"] = "completed"
					w.push("alerts", alert)
					w.finishRun(r, "protected", "failed", message)
					return
				}
				w.push("alerts", alert)
			}
		}
	}
}
func ruleFails(value float64, rule Obj) bool {
	switch str(rule, "operator") {
	case "lt":
		return value < num(rule, "threshold")
	case "gte":
		return value >= num(rule, "threshold")
	case "lte":
		return value <= num(rule, "threshold")
	default:
		return value > num(rule, "threshold")
	}
}
func (w *Workspace) tick() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	changed := false
	for _, schedule := range w.data["schedules"] {
		if str(schedule, "status") != "enabled" {
			continue
		}
		at, err := time.Parse(time.RFC3339, str(schedule, "nextAt"))
		if err != nil || time.Now().Before(at) {
			continue
		}
		key := str(schedule, "id") + ":" + str(schedule, "nextAt")
		exists := false
		for _, occ := range w.data["occurrences"] {
			if str(occ, "key") == key {
				exists = true
			}
		}
		if !exists {
			scene := obj(schedule["snapshot"])
			run, err := w.createRun(scene, Obj{"kind": "load", "idempotencyKey": key}, w.data["users"][0])
			occ := Obj{"name": str(schedule, "name"), "projectId": str(schedule, "projectId"), "scheduleId": str(schedule, "id"), "key": key, "status": "queued"}
			if err != nil {
				occ["status"] = "failed"
				occ["error"] = err.Error()
			} else {
				occ["runId"] = run["id"]
				schedule["lastRunId"] = run["id"]
			}
			w.push("occurrences", occ)
		}
		if str(schedule, "frequency") == "once" {
			schedule["status"] = "completed"
		} else {
			next, err := nextOccurrences(schedule, time.Now(), 1)
			if err != nil {
				schedule["status"] = "error"
			} else {
				schedule["nextAt"] = next[0]
			}
		}
		changed = true
	}
	for _, r := range w.data["runs"] {
		switch str(r, "status") {
		case "queued":
			if secondsSince(str(r, "createdAt")) < .5 {
				continue
			}
			beforeNodes := len(w.data["resources"])
			err := w.allocateRun(r)
			if err != nil {
				if err.Error() == "queue_busy" {
					continue
				}
				w.data["resources"] = w.data["resources"][:beforeNodes]
				w.finishRun(r, "failed", "inconclusive", err.Error())
			} else {
				r["status"] = "provisioning"
				r["preparedAt"] = now()
				w.addRunEvent(r, "info", "Worker Pods are being prepared.")
			}
			changed = true
		case "provisioning":
			if secondsSince(str(r, "preparedAt")) < 1 {
				continue
			}
			r["status"] = "running"
			r["startedAt"] = now()
			for _, s := range arr(r["shards"]) {
				s["status"] = "running"
				if p := w.find("pods", str(s, "podId")); p != nil {
					p["status"] = "running"
				}
			}
			w.addRunEvent(r, "info", "All workers ready. Start barrier released.")
			w.notify(r, "Run started", "Execution started across allocated workers.")
			changed = true
		case "running":
			w.advanceRun(r)
			changed = true
		}
	}
	for _, n := range w.data["resources"] {
		if str(n, "status") == "ready" || str(n, "status") == "draining" {
			n["heartbeatAt"] = now()
			n["cpu"] = number(5 + num(n, "allocated")/math.Max(1, num(n, "capacity"))*72)
			n["memory"] = number(19 + num(n, "allocated")/math.Max(1, num(n, "capacity"))*38)
		}
	}
	if changed {
		if err := w.save(); err != nil {
			for _, r := range w.data["runs"] {
				if !terminalState(str(r, "status")) {
					w.addRunEvent(r, "error", "Checkpoint failed. Export the report before restarting.")
				}
			}
		}
	}
}
func (w *Workspace) action(user Obj, kind string, item, in Obj) (Obj, error) {
	action := str(in, "action")
	switch kind {
	case "resources":
		switch action {
		case "probe":
			item["probe"] = []Obj{{"name": "Address resolution", "status": "passed"}, {"name": "Agent handshake", "status": "passed"}, {"name": "Engine capabilities", "status": "passed"}}
			if strings.Contains(str(item, "address"), "offline") || strings.Contains(str(item, "address"), "unreachable") {
				item["status"] = "offline"
				item["probe"] = []Obj{{"name": "Agent handshake", "status": "failed", "message": "Connection timed out"}}
			} else {
				item["status"] = "ready"
				item["heartbeatAt"] = now()
			}
		case "drain":
			item["status"] = "draining"
		case "enable":
			item["status"] = "ready"
		case "offline":
			item["status"] = "offline"
		default:
			return nil, errors.New("invalid_action")
		}
	case "clusters":
		if action == "probe" {
			item["status"] = "connected"
			item["lastTestAt"] = now()
			if strings.Contains(str(item, "endpoint"), "unreachable") {
				item["status"] = "error"
			}
		} else if action == "drain" {
			item["status"] = "draining"
			for _, n := range w.data["resources"] {
				if str(n, "clusterId") == str(item, "id") {
					n["status"] = "draining"
				}
			}
		} else {
			return nil, errors.New("invalid_action")
		}
	case "pods":
		if action == "terminate" {
			item["status"] = "failed"
			if r := w.find("runs", str(item, "runId")); r != nil && !terminalState(str(r, "status")) {
				for _, s := range arr(r["shards"]) {
					if str(s, "podId") == str(item, "id") {
						s["status"] = "failed"
					}
				}
				w.finishRun(r, "partial", "inconclusive", "Pod terminated by "+str(user, "name"))
			}
		} else {
			return nil, errors.New("invalid_action")
		}
	case "schedules":
		if action == "pause" {
			item["status"] = "paused"
		} else if action == "resume" {
			next, err := nextOccurrences(item, time.Now(), 1)
			if err != nil {
				return nil, err
			}
			item["nextAt"] = next[0]
			item["status"] = "enabled"
		} else if action == "run" {
			r, err := w.createRun(obj(item["snapshot"]), Obj{"kind": "load"}, user)
			if err != nil {
				return nil, err
			}
			return r, nil
		} else {
			return nil, errors.New("invalid_action")
		}
	case "alerts":
		if action != "acknowledge" {
			return nil, errors.New("invalid_action")
		}
		item["status"] = "acknowledged"
		item["acknowledgedBy"] = str(user, "name")
	case "deliveries":
		if action != "retry" {
			return nil, errors.New("invalid_action")
		}
		item["attempts"] = num(item, "attempts") + 1
		if str(item, "channel") == "inbox" {
			item["status"] = "delivered"
		} else {
			item["status"] = "simulated"
		}
	case "integrations", "contacts":
		if action != "test" {
			return nil, errors.New("invalid_action")
		}
		item["lastTestAt"] = now()
		item["lastTestResult"] = "passed"
		item["status"] = "connected"
		if strings.Contains(str(item, "endpoint"), "unreachable") {
			item["lastTestResult"] = "failed"
			item["status"] = "error"
		}
	case "recordings":
		if action == "capture" {
			scene := clone(w.find("scenarios", "scn_checkout"))
			scene["engine"] = "native"
			scene["fileIds"] = []string{}
			result := w.evaluate(scene, Obj{"id": "capture", "source": "measured"})
			if !flag(result, "valid") {
				return nil, errors.New(str(result, "error"))
			}
			item["requests"] = clone(arr(scene["steps"]))
			item["captureSamples"] = result["samples"]
			item["source"] = "managed"
			item["status"] = "captured"
		} else if action == "convert" {
			s := sceneDefaults(str(item, "name"), str(item, "projectId"), "HTTP", "simple")
			s["steps"] = clone(arr(item["requests"]))
			if len(arr(s["steps"])) == 0 {
				return nil, errors.New("recording_empty")
			}
			s["environmentId"] = ""
			if err := w.upsert(user, "scenarios", s); err != nil {
				return nil, err
			}
			item["scenarioId"] = s["id"]
			return s, nil
		} else {
			return nil, errors.New("invalid_action")
		}
	case "terminals":
		if action != "close" {
			return nil, errors.New("invalid_action")
		}
		item["status"] = "closed"
	default:
		return nil, errors.New("invalid_action")
	}
	item["updatedAt"] = now()
	return item, nil
}
func (w *Workspace) command(user Obj, id, command string) (Obj, error) {
	if !has([]string{"admin", "operator"}, str(user, "role")) {
		return nil, errors.New("permission_denied")
	}
	s := w.find("terminals", id)
	if s == nil {
		return nil, errors.New("session_not_found")
	}
	if str(s, "ownerId") != str(user, "id") {
		return nil, errors.New("permission_denied")
	}
	expires, _ := time.Parse(time.RFC3339, str(s, "expiresAt"))
	if str(s, "status") != "connected" || time.Now().After(expires) {
		s["status"] = "closed"
		return nil, errors.New("session_expired")
	}
	if len(command) > 1000 {
		return nil, errors.New("command_too_long")
	}
	target := w.find("resources", str(s, "resourceId"))
	if target == nil {
		target = w.find("pods", str(s, "resourceId"))
	}
	if target == nil {
		return nil, errors.New("resource_not_found")
	}
	var run Obj
	if str(target, "runId") != "" {
		run = w.find("runs", str(target, "runId"))
	}
	fields := strings.Fields(command)
	output := ""
	cwd := str(s, "cwd")
	if len(fields) > 0 {
		switch fields[0] {
		case "help":
			output = "Available commands: help, hostname, whoami, pwd, ls, cd, cat, ps, env, tail, top, date, clear, exit"
		case "hostname":
			output = str(target, "name")
		case "whoami":
			output = "perfman"
		case "pwd":
			output = cwd
		case "ls":
			output = "run.json  engine.log  environment.env  artifacts/"
		case "cd":
			if len(fields) > 1 && has([]string{"/workspace", "artifacts", "/workspace/artifacts", "..", "/"}, fields[1]) {
				if fields[1] == "artifacts" || fields[1] == "/workspace/artifacts" {
					s["cwd"] = "/workspace/artifacts"
				} else {
					s["cwd"] = "/workspace"
				}
			} else {
				output = "cd: directory not found"
			}
		case "cat", "tail":
			file := ""
			if len(fields) > 1 {
				file = fields[len(fields)-1]
			}
			switch file {
			case "run.json":
				if run != nil {
					b, _ := json.MarshalIndent(obj(run["snapshot"]), "", "  ")
					output = string(b)
				} else {
					output = "No active assignment"
				}
			case "engine.log":
				if run != nil {
					for _, log := range arr(run["logs"]) {
						output += fmt.Sprintf("[%s] %s\n", str(log, "level"), str(log, "message"))
					}
				} else {
					output = "[info] Agent ready; waiting for assignments"
				}
			case "environment.env":
				output = "REGION=" + str(target, "region") + "\nWORKSPACE=acme\nCREDENTIALS=[redacted]"
			default:
				output = "File not found: " + file
			}
		case "ps":
			output = "PID   STATUS   COMMAND\n1     ready    perfman-agent"
			if run != nil && !terminalState(str(run, "status")) {
				output += "\n24    running  perfman-engine --run " + str(run, "id")
			}
		case "env":
			output = "REGION=" + str(target, "region") + "\nNAMESPACE=perfman-runs\nHOME=/workspace"
		case "top":
			output = fmt.Sprintf("Resource %s\nCPU %.1f%%\nMemory %.1f MiB\nStatus %s", str(target, "name"), num(target, "cpu"), num(target, "memory"), str(target, "status"))
		case "date":
			output = time.Now().UTC().Format(time.RFC1123)
		case "clear":
			output = "\x1b[clear]"
		case "exit":
			s["status"] = "closed"
			output = "Session closed"
		default:
			output = "Command not available: " + fields[0] + ". Type help."
		}
	}
	entry := Obj{"command": command, "output": output, "at": now(), "cwd": s["cwd"]}
	history := arr(s["history"])
	history = append(history, entry)
	if len(history) > 100 {
		history = history[len(history)-100:]
	}
	s["history"] = history
	w.audit(user, "terminal.command", str(target, "name")+": "+command)
	return entry, nil
}
