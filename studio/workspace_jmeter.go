package studio

import (
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"strings"
)

// The managed JMeter provider compiles supported samplers into the same
// execution plan as native scenarios. It does not execute uploaded JVM code.
func parseJMX(content string) ([]Obj, []Obj, error) {
	d := xml.NewDecoder(strings.NewReader(content))
	steps := []Obj{}
	groups := []Obj{}
	var current, last, assertion Obj
	samplerTag := ""
	root := false
	for {
		token, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, errors.New("invalid_jmx")
		}
		switch el := token.(type) {
		case xml.StartElement:
			name := el.Name.Local
			testName := ""
			for _, a := range el.Attr {
				if a.Name.Local == "testname" {
					testName = a.Value
				}
			}
			if name == "jmeterTestPlan" {
				root = true
			}
			if strings.Contains(name, "BeanShell") || strings.Contains(name, "JSR223") {
				return nil, nil, fmt.Errorf("jmx_component_not_supported: %s", name)
			}
			if name == "ThreadGroup" || strings.HasSuffix(name, "ThreadGroup") {
				groups = append(groups, Obj{"name": testName, "threads": 1, "loops": 1})
			}
			if name == "HTTPSamplerProxy" || name == "TCPSampler" || strings.Contains(name, "WebSocket") && testName != "" {
				protocol := "HTTP"
				if name == "TCPSampler" {
					protocol = "TCP"
				}
				if strings.Contains(name, "WebSocket") {
					protocol = "WebSocket"
				}
				current = defaultStep(protocol)
				current["name"] = testName
				current["_domain"] = "api.acme.internal"
				current["_path"] = "/"
				current["_scheme"] = "https"
				if protocol == "WebSocket" {
					current["_scheme"] = "wss"
				}
				if len(groups) > 0 {
					current["threadGroup"] = str(groups[len(groups)-1], "name")
					current["scriptWeight"] = num(groups[len(groups)-1], "threads")
				}
				samplerTag = name
			}
			if name == "ResponseAssertion" {
				assertion = Obj{"name": testName, "type": "contains", "operator": "contains", "expected": ""}
			}
			if name == "doubleProp" {
				var value struct {
					Name  string  `xml:"name"`
					Value float64 `xml:"value"`
				}
				if err := d.DecodeElement(&value, &el); err != nil {
					return nil, nil, errors.New("invalid_jmx")
				}
				if len(groups) > 0 && value.Name == "throughput" {
					groups[len(groups)-1]["throughputRps"] = value.Value / 60
				}
			}
			if name == "stringProp" || name == "boolProp" || name == "intProp" {
				key := ""
				for _, a := range el.Attr {
					if a.Name.Local == "name" {
						key = a.Value
					}
				}
				var value string
				if err := d.DecodeElement(&value, &el); err != nil {
					return nil, nil, errors.New("invalid_jmx")
				}
				if len(groups) > 0 {
					g := groups[len(groups)-1]
					switch key {
					case "ThreadGroup.num_threads":
						g["threads"] = parseInt(value)
					case "LoopController.loops":
						g["loops"] = parseInt(value)
					case "throughput":
						var perMinute float64
						fmt.Sscan(value, &perMinute)
						g["throughputRps"] = perMinute / 60
					case "calcMode":
						g["throughputMode"] = parseInt(value)
					case "filename":
						g["csvFile"] = path.Base(value)
					}
				}
				if current != nil {
					switch key {
					case "HTTPSampler.domain", "server", "TCPClient.server":
						current["_domain"] = value
					case "HTTPSampler.path", "path":
						current["_path"] = value
					case "HTTPSampler.protocol":
						if value != "" {
							current["_scheme"] = value
						}
					case "HTTPSampler.method":
						current["method"] = value
					case "Argument.value", "TCPClient.request", "requestData", "payload":
						current["body"] = value
					}
				}
				if assertion != nil {
					if key == "Assertion.test_field" && strings.Contains(value, "response_code") {
						assertion["type"] = "status"
						assertion["operator"] = "eq"
					}
					if key == "0" || key == "1" || strings.HasPrefix(key, "assertion.expected") {
						assertion["expected"] = value
					}
				}
			}
		case xml.EndElement:
			if current != nil && el.Name.Local == samplerTag {
				current["url"] = str(current, "_scheme") + "://" + str(current, "_domain") + str(current, "_path")
				for k := range current {
					if strings.HasPrefix(k, "_") {
						delete(current, k)
					}
				}
				if str(current, "method") == "POST" {
					current["checks"] = []Obj{{"name": "Request accepted", "type": "status", "operator": "eq", "expected": 201}}
				}
				steps = append(steps, current)
				last = current
				current = nil
			}
			if el.Name.Local == "ResponseAssertion" && assertion != nil {
				if last != nil && str(assertion, "expected") != "" {
					last["checks"] = append(arr(last["checks"]), assertion)
				}
				assertion = nil
			}
		}
	}
	if !root {
		return nil, nil, errors.New("invalid_jmx")
	}
	if len(steps) == 0 {
		return nil, nil, errors.New("jmx_sampler_required")
	}
	return steps, groups, nil
}

// Rate limits are compiled from the frozen JMX. calcMode=0 is per thread;
// the other ConstantThroughputTimer modes share the group target.
func jmeterRateLimit(scene, run Obj, elapsed float64) float64 {
	if str(scene, "mode") != "jmeter" {
		return 0
	}
	var groups []Obj
	for _, f := range arr(run["_files"]) {
		if str(f, "id") == str(scene, "jmxId") {
			_, groups, _ = parseJMX(str(f, "content"))
			break
		}
	}
	if str(scene, "threadMode") == "serial" && len(groups) > 1 {
		phase := min(len(groups)-1, int(elapsed/math.Max(1, num(scene, "duration")/float64(len(groups)))))
		groups = groups[phase : phase+1]
	}
	limit := 0.0
	for _, g := range groups {
		rate := num(g, "throughputRps")
		if rate <= 0 {
			return 0
		} // An unconstrained group prevents a global cap.
		if num(g, "throughputMode") == 0 {
			rate *= math.Max(1, num(g, "threads"))
		}
		limit += rate
	}
	return limit
}
