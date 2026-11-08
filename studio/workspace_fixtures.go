package studio

import (
	"math"
	"regexp"
)

// Upgrade only the named synthetic history, never user-created executions.
func (w *Workspace) normalizeFixtures() {
	fixture := regexp.MustCompile(`^run_\d{5}$`)
	for _, r := range w.data["runs"] {
		if !fixture.MatchString(str(r, "id")) || num(r, "_fixtureVersion") >= 1 {
			continue
		}
		m := obj(r["metrics"])
		total, failed, in, out := 0.0, 0.0, 0.0, 0.0
		for _, p := range arr(r["points"]) {
			n := math.Round(num(p, "rps"))
			e := math.Round(n * num(p, "errorRate") / 100)
			p["rps"] = n
			p["errorRate"] = number(100 * e / math.Max(1, n))
			p["checkFailureRate"] = p["errorRate"]
			p["bytesIn"] = n * 430
			p["bytesOut"] = n * 180
			total += n
			failed += e
			in += n * 430
			out += n * 180
		}
		m["requests"] = total
		m["errors"] = failed
		m["rps"] = number(total / math.Max(1, num(r, "elapsed")))
		m["bytesIn"] = in
		m["bytesOut"] = out
		m["checks"] = total
		m["checkFailures"] = failed
		m["errorRate"] = number(100 * failed / math.Max(1, total))
		m["checkFailureRate"] = m["errorRate"]
		ends := arr(r["endpoints"])
		shares := []Obj{}
		for range ends {
			shares = append(shares, Obj{"percent": 100 / float64(max(1, len(ends)))})
		}
		counts, errors := splitBudget(int(total), shares), splitBudget(int(failed), shares)
		for i, ep := range ends {
			ep["requests"] = counts[i]
			ep["errors"] = errors[i]
		}
		for i, c := range arr(r["checks"]) {
			if i < len(counts) {
				c["total"] = counts[i]
				c["failed"] = errors[i]
				c["passRate"] = number(100 * (1 - float64(errors[i])/math.Max(1, float64(counts[i]))))
			}
		}
		m["iterations"] = math.Round(total / float64(max(1, len(ends))))
		shards := arr(r["shards"])
		target := 0.0
		for _, s := range shards {
			target += num(s, "target")
		}
		shares = []Obj{}
		for _, s := range shards {
			shares = append(shares, Obj{"percent": 100 * num(s, "target") / math.Max(1, target)})
		}
		counts = splitBudget(int(total), shares)
		for i, s := range shards {
			s["requests"] = counts[i]
			for _, n := range w.data["resources"] {
				if str(n, "region") == str(s, "region") && str(n, "groupId") == str(obj(r["snapshot"]), "groupId") {
					s["workerId"] = n["id"]
					s["workerName"] = n["name"]
					break
				}
			}
		}
		r["_fixtureVersion"] = 1
	}
	for _, a := range w.data["alerts"] {
		if str(a, "runId") != "run_02478" {
			continue
		}
		if r := w.find("runs", str(a, "runId")); r != nil {
			a["projectId"] = r["projectId"]
			a["scenarioId"] = r["scenarioId"]
			a["stopStatus"] = r["status"]
		}
	}
}
