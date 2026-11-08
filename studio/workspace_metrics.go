package studio

import (
	"fmt"
	"net/http"
)

// Exports the same provenance and scope as the report API. This endpoint uses
// a normal authenticated session; it never bypasses project or tag policies.
func (w *Workspace) exportMetrics(out http.ResponseWriter, user Obj) {
	out.Header().Set("Content-Type", "text/plain; version=0.0.4")
	for _, definition := range []string{
		"perfman_requests_total counter", "perfman_request_errors_total counter",
		"perfman_checks_total counter", "perfman_check_failures_total counter",
		"perfman_request_duration_milliseconds gauge", "perfman_request_rate gauge",
		"perfman_worker_capacity gauge", "perfman_worker_allocated gauge",
		"perfman_worker_cpu_percent gauge", "perfman_worker_memory_percent gauge",
		"perfman_shard_requests_total counter",
	} {
		fmt.Fprintf(out, "# TYPE %s\n", definition)
	}
	for _, run := range w.data["runs"] {
		if !w.allowed(user, str(run, "projectId")) || !w.policyAllowed(user, "runs.read", run) {
			continue
		}
		m := obj(run["metrics"])
		labels := fmt.Sprintf("run=%q,project=%q,source=%q", str(run, "id"), str(run, "projectId"), str(run, "source"))
		for name, field := range map[string]string{"perfman_requests_total": "requests", "perfman_request_errors_total": "errors", "perfman_checks_total": "checks", "perfman_check_failures_total": "checkFailures", "perfman_request_rate": "rps"} {
			fmt.Fprintf(out, "%s{%s} %g\n", name, labels, num(m, field))
		}
		for _, q := range []string{"p50", "p95", "p99"} {
			fmt.Fprintf(out, "perfman_request_duration_milliseconds{%s,statistic=%q} %g\n", labels, q, num(m, q))
		}
		for _, shard := range arr(run["shards"]) {
			fmt.Fprintf(out, "perfman_shard_requests_total{%s,worker=%q,region=%q} %g\n", labels, str(shard, "workerId"), str(shard, "region"), num(shard, "requests"))
		}
	}
	for _, n := range w.data["resources"] {
		if !w.policyAllowed(user, "resources.read", n) {
			continue
		}
		labels := fmt.Sprintf("worker=%q,group=%q,region=%q,source=%q", str(n, "id"), str(n, "groupId"), str(n, "region"), str(n, "provider"))
		for name, field := range map[string]string{"perfman_worker_capacity": "capacity", "perfman_worker_allocated": "allocated", "perfman_worker_cpu_percent": "cpu", "perfman_worker_memory_percent": "memory"} {
			fmt.Fprintf(out, "%s{%s} %g\n", name, labels, num(n, field))
		}
	}
}
