package studio

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"path"
	"strings"
)

// Policies refine role permissions. Deny rules take precedence; allow rules can
// restrict access by project and resource tags without granting a broader role.
func (w *Workspace) policyAllowed(user Obj, action string, resource Obj) bool {
	if str(user, "role") == "admin" {
		return true
	}
	principal := str(user, "id")
	role := str(user, "role")
	matchedAllow, hasAllow := false, false
	for _, policy := range w.data["policies"] {
		if str(policy, "status") == "disabled" {
			continue
		}
		subject := str(policy, "subject")
		if subject != "*" && subject != principal && subject != "role:"+role {
			continue
		}
		pattern := str(policy, "action")
		if pattern == "" {
			pattern = "*"
		}
		match, _ := path.Match(pattern, action)
		if !match {
			continue
		}
		if str(policy, "effect") == "allow" {
			hasAllow = true
		}
		matches := true
		if pid := str(policy, "projectId"); pid != "" && pid != "*" && pid != str(resource, "projectId") {
			matches = false
		}
		tag := str(policy, "tag")
		if tag != "" {
			tags := stringsOf(resource["tags"])
			if p := w.find("projects", str(resource, "projectId")); p != nil {
				tags = append(tags, stringsOf(p["tags"])...)
			}
			if !has(tags, tag) {
				matches = false
			}
		}
		if !matches {
			continue
		}
		if str(policy, "effect") == "deny" {
			return false
		}
		matchedAllow = true
	}
	return !hasAllow || matchedAllow
}
func exportCSV(out http.ResponseWriter, r Obj) {
	out.Header().Set("Content-Type", "text/csv; charset=utf-8")
	out.Header().Set("Content-Disposition", `attachment; filename="`+str(r, "id")+`.csv"`)
	cw := csv.NewWriter(out)
	cw.Write([]string{"source", "second", "rps", "p95_ms", "request_error_percent", "check_failure_percent", "target_vus", "bytes_in", "bytes_out"})
	for _, p := range arr(r["points"]) {
		cw.Write([]string{str(r, "source"), fmt.Sprint(p["second"]), fmt.Sprint(p["rps"]), fmt.Sprint(p["p95"]), fmt.Sprint(p["errorRate"]), fmt.Sprint(p["checkFailureRate"]), fmt.Sprint(p["vus"]), fmt.Sprint(p["bytesIn"]), fmt.Sprint(p["bytesOut"])})
	}
	cw.Flush()
}

func (w *Workspace) ensureClusters() {
	if len(w.data["clusters"]) > 0 {
		return
	}
	for _, g := range w.data["groups"] {
		cluster := Obj{"id": "cluster_" + str(g, "id"), "name": str(g, "name"), "endpoint": "https://kubernetes." + strings.ReplaceAll(strings.ToLower(str(g, "name")), " ", "-") + ".internal", "namespace": "perfman-runs", "provider": "simulator", "status": "connected", "groupId": str(g, "id"), "version": 1}
		w.push("clusters", cluster)
		for _, n := range w.data["resources"] {
			if str(n, "groupId") == str(g, "id") {
				n["clusterId"] = str(cluster, "id")
			}
		}
	}
}

func publicRecord(record Obj) Obj {
	safe := clone(record)
	for key := range safe {
		if strings.HasPrefix(key, "_") {
			delete(safe, key)
		}
	}
	delete(safe, "passwordHash")
	if metrics, ok := safe["metrics"]; ok {
		for key := range obj(metrics) {
			if strings.HasPrefix(key, "_") {
				delete(obj(metrics), key)
			}
		}
	}
	return safe
}
