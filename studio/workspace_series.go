package studio

import (
	"math"
)

func (w *Workspace) recordSeries(r Obj, samples []Obj, weights map[string]float64, elapsed float64, overall Obj) {
	series := obj(r["series"])
	if len(series) == 0 {
		series = Obj{"services": Obj{}, "scripts": Obj{}, "regions": Obj{}}
		r["series"] = series
	}
	for _, dimension := range []string{"services", "scripts"} {
		groups := map[string][]Obj{}
		for _, s := range samples {
			key := str(s, "name")
			if dimension == "scripts" {
				key = str(s, "script")
				if key == "" {
					key = "main"
				}
			}
			groups[key] = append(groups[key], s)
		}
		for key, list := range groups {
			hist := Obj{}
			count, failed, sum := 0.0, 0.0, 0.0
			for _, s := range list {
				weight := weights[str(s, "id")]
				lat := num(s, "duration")
				count += weight
				sum += lat * weight
				addHist(hist, lat, weight)
				if str(s, "error") != "" || str(s, "protocol") == "HTTP" && num(s, "status") >= 400 {
					failed += weight
				}
			}
			p := Obj{"second": number(elapsed), "rps": count, "p95": histogramQ(hist, .95), "p99": histogramQ(hist, .99), "mean": number(sum / math.Max(count, 1)), "errorRate": number(100 * failed / math.Max(count, 1)), "vus": num(overall, "vus")}
			bucket := obj(series[dimension])
			bucket[key] = append(arr(bucket[key]), p)
		}
	}
	shards := arr(r["shards"])
	sumTargets := 0.0
	byRegion := map[string]float64{}
	for _, s := range shards {
		sumTargets += num(s, "target")
		byRegion[str(s, "region")] += num(s, "target")
	}
	for region, target := range byRegion {
		point := clone(overall)
		point["rps"] = number(num(overall, "rps") * target / math.Max(1, sumTargets))
		point["vus"] = number(num(overall, "vus") * target / math.Max(1, sumTargets))
		bucket := obj(series["regions"])
		bucket[region] = append(arr(bucket[region]), point)
	}
}

// Each allocated worker has a separate script context and dataset partition.
// The simulator keeps bounded representative executions per worker, then models
// the requested load. It never creates a goroutine for every logical VU.
func (w *Workspace) evaluateShards(scene, r Obj) Obj {
	shards := arr(r["shards"])
	if len(shards) == 0 {
		return w.evaluate(scene, r)
	}
	total := 0.0
	for _, s := range shards {
		total += num(s, "target")
	}
	samples, checks, logs := []Obj{}, []Obj{}, []Obj{}
	logicalRequests, iterationSeconds := 0.0, 0.0
	for index, shard := range shards {
		probe := Obj{"id": str(r, "id") + "-" + str(shard, "id"), "status": str(r, "status"), "source": str(r, "source"), "elapsed": num(r, "elapsed"), "region": str(shard, "region"), "workerId": str(shard, "workerId"), "shardId": str(shard, "id"), "shardIndex": index, "shardCount": len(shards), "_files": r["_files"], "_environment": r["_environment"]}
		result := w.evaluate(scene, probe)
		if !flag(result, "valid") {
			return result
		}
		share := num(shard, "target") / math.Max(1, total)
		localSamples := arr(result["samples"])
		logicalRequests += float64(len(localSamples)) * share
		duration := num(scene, "thinkMs")/1000 + num(result, "sleepSeconds")
		for _, s := range localSamples {
			s["workerId"] = str(shard, "workerId")
			s["region"] = str(shard, "region")
			s["workerShare"] = share
			duration += num(s, "duration") / 1000
		}
		iterationSeconds += duration * share
		samples = append(samples, localSamples...)
		for _, c := range arr(result["checks"]) {
			c["workerId"] = str(shard, "workerId")
			checks = append(checks, c)
		}
		logs = append(logs, arr(result["logs"])...)
	}
	return Obj{"valid": true, "samples": samples, "checks": checks, "logs": logs, "logicalRequests": logicalRequests, "iterationSeconds": iterationSeconds}
}
