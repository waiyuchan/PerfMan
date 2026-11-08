package studio

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

type Obj map[string]any

func str(o Obj, k string) string { v, _ := o[k].(string); return v }
func num(o Obj, k string) float64 {
	switch v := o[k].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	}
	return 0
}
func flag(o Obj, k string) bool { v, _ := o[k].(bool); return v }
func obj(v any) Obj {
	switch x := v.(type) {
	case Obj:
		return x
	case map[string]any:
		return Obj(x)
	}
	return Obj{}
}
func arr(v any) []Obj {
	out := []Obj{}
	switch x := v.(type) {
	case []Obj:
		return x
	case []any:
		for _, e := range x {
			out = append(out, obj(e))
		}
	}
	return out
}
func stringsOf(v any) []string {
	out := []string{}
	switch x := v.(type) {
	case []string:
		return x
	case []any:
		for _, s := range x {
			if v, ok := s.(string); ok {
				out = append(out, v)
			}
		}
	}
	return out
}
func has(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}
func uid(prefix string) string {
	b := make([]byte, 7)
	rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}
func hashToken(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func number(v float64) float64  { return math.Round(v*100) / 100 }
func terminalState(s string) bool {
	return has([]string{"completed", "failed", "cancelled", "protected", "partial", "interrupted"}, s)
}

var collections = []string{"projects", "environments", "files", "scenarios", "groups", "resources", "runs", "pods", "schedules", "occurrences", "contacts", "alerts", "deliveries", "recordings", "tags", "integrations", "audit", "terminals", "users", "dashboards", "policies", "clusters"}

type Workspace struct {
	mu            sync.Mutex
	db            *sql.DB
	data          map[string][]Obj
	key           []byte
	base          string
	done          chan struct{}
	wg            sync.WaitGroup
	closed        bool
	loginAttempts map[string][]time.Time
	scripts       map[string]*scriptSession
}

func NewWorkspace(path, base string) (*Workspace, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,project_id TEXT NOT NULL DEFAULT '',payload BLOB NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	keyPath := filepath.Join(filepath.Dir(path), "workspace.key")
	key, err := os.ReadFile(keyPath)
	if os.IsNotExist(err) {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err == nil {
			err = os.WriteFile(keyPath, key, 0600)
		}
	}
	if err != nil || len(key) != 32 {
		db.Close()
		return nil, errors.New("cannot load workspace encryption key")
	}
	w := &Workspace{db: db, data: map[string][]Obj{}, key: key, base: base, done: make(chan struct{}), loginAttempts: map[string][]time.Time{}}
	for _, k := range collections {
		w.data[k] = []Obj{}
	}
	rows, err := db.Query("SELECT kind,payload FROM entities ORDER BY rowid")
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k string
		var b []byte
		rows.Scan(&k, &b)
		var o Obj
		if err = json.Unmarshal(b, &o); err != nil {
			rows.Close()
			return nil, err
		}
		w.data[k] = append(w.data[k], o)
	}
	rows.Close()
	if len(w.data["users"]) == 0 {
		w.seedWorkspace()
	}
	w.normalizeFixtures()
	w.ensureClusters()
	sort.SliceStable(w.data["runs"], func(i, j int) bool { return str(w.data["runs"][i], "createdAt") < str(w.data["runs"][j], "createdAt") })
	for _, r := range w.data["runs"] {
		if !terminalState(str(r, "status")) {
			r["status"] = "interrupted"
			r["verdict"] = "inconclusive"
			r["finishedAt"] = now()
			w.addRunEvent(r, "warning", "Control plane restarted. Execution was interrupted.")
			w.releaseRun(r)
		}
	}
	for _, t := range w.data["terminals"] {
		t["status"] = "closed"
	}
	if err = w.save(); err != nil {
		db.Close()
		return nil, err
	}
	return w, nil
}
func (w *Workspace) Start() {
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-w.done:
				return
			case <-ticker.C:
				w.tick()
			}
		}
	}()
}
func (w *Workspace) Close() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	w.closed = true
	close(w.done)
	w.mu.Unlock()
	w.wg.Wait()
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, r := range w.data["runs"] {
		if !terminalState(str(r, "status")) {
			r["status"] = "interrupted"
			r["verdict"] = "inconclusive"
			r["finishedAt"] = now()
			w.addRunEvent(r, "warning", "Control plane shut down.")
			w.releaseRun(r)
		}
	}
	w.save()
	w.db.Close()
}
func (w *Workspace) save() error {
	tx, err := w.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM entities"); err != nil {
		return err
	}
	stmt, err := tx.Prepare("INSERT INTO entities(kind,id,project_id,payload) VALUES(?,?,?,?)")
	if err != nil {
		return err
	}
	defer stmt.Close()
	for k, items := range w.data {
		for _, o := range items {
			b, err := json.Marshal(o)
			if err != nil {
				return err
			}
			if _, err = stmt.Exec(k, str(o, "id"), str(o, "projectId"), b); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
func (w *Workspace) find(kind, id string) Obj {
	for _, o := range w.data[kind] {
		if str(o, "id") == id {
			return o
		}
	}
	return nil
}
func (w *Workspace) push(kind string, o Obj) {
	if str(o, "id") == "" {
		o["id"] = uid(strings.TrimSuffix(kind, "s"))
	}
	if str(o, "createdAt") == "" {
		o["createdAt"] = now()
	}
	o["updatedAt"] = now()
	w.data[kind] = append(w.data[kind], o)
}
func (w *Workspace) audit(user Obj, action, target string) {
	w.push("audit", Obj{"actor": str(user, "name"), "actorId": str(user, "id"), "action": action, "target": target})
	if len(w.data["audit"]) > 800 {
		w.data["audit"] = w.data["audit"][len(w.data["audit"])-800:]
	}
}
func (w *Workspace) encrypt(s string) string {
	block, _ := aes.NewCipher(w.key)
	a, _ := cipher.NewGCM(block)
	nonce := make([]byte, a.NonceSize())
	rand.Read(nonce)
	return "enc:" + base64.StdEncoding.EncodeToString(a.Seal(nonce, nonce, []byte(s), nil))
}
func (w *Workspace) decrypt(s string) string {
	if !strings.HasPrefix(s, "enc:") {
		return s
	}
	b, err := base64.StdEncoding.DecodeString(s[4:])
	if err != nil {
		return ""
	}
	block, _ := aes.NewCipher(w.key)
	a, _ := cipher.NewGCM(block)
	if len(b) < a.NonceSize() {
		return ""
	}
	out, err := a.Open(nil, b[:a.NonceSize()], b[a.NonceSize():], nil)
	if err != nil {
		return ""
	}
	return string(out)
}
func (w *Workspace) allowed(user Obj, pid string) bool {
	return str(user, "role") == "admin" || pid == "" || has(stringsOf(user["projects"]), pid)
}
func (w *Workspace) public(user Obj) map[string][]Obj {
	out := map[string][]Obj{}
	for k, items := range w.data {
		out[k] = []Obj{}
		if (k == "users" || k == "policies") && str(user, "role") != "admin" {
			continue
		}
		if k == "audit" && str(user, "role") != "admin" {
			continue
		}
		for _, original := range items {
			if !w.allowed(user, str(original, "projectId")) || !w.policyAllowed(user, k+".read", original) || k == "terminals" && str(original, "ownerId") != str(user, "id") {
				continue
			}
			o := publicRecord(original)
			for key := range o {
				if strings.HasPrefix(key, "_") {
					delete(o, key)
				}
			}
			if k == "users" {
				delete(o, "passwordHash")
			}
			if k == "environments" {
				for _, v := range arr(o["variables"]) {
					if flag(v, "secret") {
						v["value"] = "••••••••"
					}
				}
			}
			out[k] = append(out[k], o)
		}
	}
	return out
}
func (w *Workspace) session(r *http.Request) Obj {
	c, err := r.Cookie("perfman_session")
	if err != nil {
		return nil
	}
	var userID string
	var expiry int64
	if w.db.QueryRow("SELECT user_id,expires FROM sessions WHERE token_hash=?", hashToken(c.Value)).Scan(&userID, &expiry) != nil || time.Now().Unix() > expiry {
		return nil
	}
	u := w.find("users", userID)
	if u == nil || str(u, "status") == "suspended" {
		return nil
	}
	return u
}
func workspaceError(w http.ResponseWriter, status int, code string) {
	reply(w, status, Obj{"error": code, "code": code})
}
func workspaceDecode(w http.ResponseWriter, r *http.Request, out any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20))
	if err := d.Decode(out); err != nil {
		workspaceError(w, 400, "invalid_json")
		return false
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		workspaceError(w, 400, "invalid_json")
		return false
	}
	return true
}
func (w *Workspace) Handler() http.Handler {
	assets, _ := fs.Sub(ConsoleAssets, "console")
	files := http.FileServer(http.FS(assets))
	return http.HandlerFunc(func(out http.ResponseWriter, r *http.Request) {
		out.Header().Set("X-Content-Type-Options", "nosniff")
		out.Header().Set("Referrer-Policy", "same-origin")
		out.Header().Set("Cache-Control", "no-store")
		if r.URL.Path == "/healthz" {
			reply(out, 200, Obj{"status": "ok", "service": "perfman"})
			return
		}
		if strings.HasPrefix(r.URL.Path, "/target-api/") {
			w.targetAPI(out, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if r.Method != "GET" {
				if origin := r.Header.Get("Origin"); origin != "" {
					u, err := url.Parse(origin)
					if err != nil || u.Host != r.Host {
						workspaceError(out, 403, "origin_denied")
						return
					}
				}
				if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
					workspaceError(out, 415, "json_required")
					return
				}
			}
			w.handle(out, r)
			return
		}
		if r.URL.Path == "/" {
			r.URL.Path = "/index.html"
			b, _ := fs.ReadFile(assets, "index.html")
			out.Header().Set("Content-Type", "text/html; charset=utf-8")
			out.Write(b)
			return
		}
		files.ServeHTTP(out, r)
	})
}

func (w *Workspace) handle(out http.ResponseWriter, r *http.Request) {
	w.mu.Lock()
	defer w.mu.Unlock()
	p := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/"), "/")
	path := strings.Join(p, "/")
	if path == "session" && r.Method == "POST" {
		var in Obj
		if !workspaceDecode(out, r, &in) {
			return
		}
		email := strings.ToLower(strings.TrimSpace(str(in, "email")))
		attempts := []time.Time{}
		for _, t := range w.loginAttempts[email] {
			if time.Since(t) < time.Minute {
				attempts = append(attempts, t)
			}
		}
		if len(attempts) >= 10 {
			workspaceError(out, 429, "too_many_attempts")
			return
		}
		w.loginAttempts[email] = append(attempts, time.Now())
		var user Obj
		for _, u := range w.data["users"] {
			if str(u, "email") == email && str(u, "status") != "suspended" && bcrypt.CompareHashAndPassword([]byte(str(u, "passwordHash")), []byte(str(in, "password"))) == nil {
				user = u
			}
		}
		if user == nil {
			workspaceError(out, 401, "invalid_credentials")
			return
		}
		delete(w.loginAttempts, email)
		token := uid("s") + uid("t")
		if _, err := w.db.Exec("INSERT INTO sessions(token_hash,user_id,expires)VALUES(?,?,?)", hashToken(token), str(user, "id"), time.Now().Add(24*time.Hour).Unix()); err != nil {
			workspaceError(out, 500, "storage_failed")
			return
		}
		http.SetCookie(out, &http.Cookie{Name: "perfman_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: r.TLS != nil, MaxAge: 86400})
		w.audit(user, "session.sign_in", str(user, "email"))
		w.save()
		safe := clone(user)
		delete(safe, "passwordHash")
		reply(out, 200, safe)
		return
	}
	user := w.session(r)
	if user == nil {
		workspaceError(out, 401, "authentication_required")
		return
	}
	if path == "session" {
		if r.Method == "DELETE" {
			if c, e := r.Cookie("perfman_session"); e == nil {
				w.db.Exec("DELETE FROM sessions WHERE token_hash=?", hashToken(c.Value))
			}
			http.SetCookie(out, &http.Cookie{Name: "perfman_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
			reply(out, 200, Obj{"ok": true})
			return
		}
		safe := clone(user)
		delete(safe, "passwordHash")
		reply(out, 200, safe)
		return
	}
	if path == "extract" && r.Method == "POST" {
		w.extractAPI(out, r)
		return
	}
	if path == "preferences" && r.Method == "POST" {
		var in Obj
		if !workspaceDecode(out, r, &in) {
			return
		}
		if has([]string{"en", "zh"}, str(in, "language")) {
			user["language"] = in["language"]
		}
		if in["dashboardMetrics"] != nil {
			metrics := stringsOf(in["dashboardMetrics"])
			if len(metrics) > 12 {
				workspaceError(out, 400, "invalid_metrics")
				return
			}
			user["dashboardMetrics"] = metrics
		}
		w.save()
		reply(out, 200, Obj{"ok": true})
		return
	}
	if path == "state" && r.Method == "GET" {
		reply(out, 200, Obj{"collections": w.public(user), "user": func() Obj { u := clone(user); delete(u, "passwordHash"); return u }(), "workspace": Obj{"name": "Acme Engineering", "id": "acme", "schemaVersion": 2}})
		return
	}
	if path == "metrics" && r.Method == "GET" {
		w.exportMetrics(out, user)
		return
	}

	candidate := Obj{}
	if len(p) >= 2 {
		candidate = w.find(p[0], p[1])
		if candidate == nil {
			candidate = Obj{}
		}
	}
	policyAction := p[0] + ".read"
	if r.Method != "GET" {
		policyAction = p[0] + ".write"
	}
	if len(p) >= 2 && !w.policyAllowed(user, policyAction, candidate) {
		workspaceError(out, 403, "permission_denied")
		return
	}
	if r.Method != "GET" {
		role := str(user, "role")
		if role == "viewer" {
			workspaceError(out, 403, "permission_denied")
			return
		}
		adminKinds := []string{"users", "integrations", "tags", "policies"}
		if has([]string{"groups", "resources", "pods", "terminals", "clusters"}, p[0]) && !has([]string{"admin", "operator"}, role) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if has(adminKinds, p[0]) && role != "admin" {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if role == "operator" && !has([]string{"groups", "resources", "pods", "terminals", "clusters"}, p[0]) {
			workspaceError(out, 403, "permission_denied")
			return
		}
	}
	if path == "validate" && r.Method == "POST" {
		var scene Obj
		if !workspaceDecode(out, r, &scene) {
			return
		}
		if !w.allowed(user, str(scene, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if err := w.validateScenario(scene); err != nil {
			workspaceError(out, 400, err.Error())
			return
		}
		source := "simulated"
		if str(scene, "engine") == "native" {
			source = "measured"
		}
		result := w.evaluate(scene, Obj{"id": "validation", "source": source})
		reply(out, 200, result)
		return
	}
	if path == "schedules/preview" && r.Method == "POST" {
		var o Obj
		if !workspaceDecode(out, r, &o) {
			return
		}
		next, err := nextOccurrences(o, time.Now(), 5)
		if err != nil {
			workspaceError(out, 400, "invalid_schedule")
			return
		}
		reply(out, 200, Obj{"times": next})
		return
	}
	if path == "runs" && r.Method == "POST" {
		var input Obj
		if !workspaceDecode(out, r, &input) {
			return
		}
		scene := w.find("scenarios", str(input, "scenarioId"))
		if scene == nil {
			workspaceError(out, 404, "not_found")
			return
		}
		if !w.allowed(user, str(scene, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		run, err := w.createRun(scene, input, user)
		if err != nil {
			workspaceError(out, 400, err.Error())
			return
		}
		if err = w.save(); err != nil {
			w.data["runs"] = w.data["runs"][:len(w.data["runs"])-1]
			workspaceError(out, 500, "storage_failed")
			return
		}
		reply(out, 201, publicRecord(run))
		return
	}
	if len(p) >= 2 && p[0] == "runs" {
		run := w.find("runs", p[1])
		if run == nil {
			workspaceError(out, 404, "not_found")
			return
		}
		if !w.allowed(user, str(run, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if len(p) == 3 && p[2] == "csv" && r.Method == "GET" {
			exportCSV(out, run)
			return
		}
		if len(p) == 3 && p[2] == "export" && r.Method == "GET" {
			safe := clone(run)
			for k := range safe {
				if strings.HasPrefix(k, "_") {
					delete(safe, k)
				}
			}
			out.Header().Set("Content-Disposition", `attachment; filename="`+str(run, "id")+`.json"`)
			reply(out, 200, safe)
			return
		}
		if len(p) == 3 && r.Method == "POST" {
			var input Obj
			if !workspaceDecode(out, r, &input) {
				return
			}
			switch p[2] {
			case "stop":
				if !terminalState(str(run, "status")) {
					w.finishRun(run, "cancelled", "inconclusive", "Stopped by "+str(user, "name"))
				}
			case "load":
				if str(run, "status") != "running" {
					workspaceError(out, 409, "run_not_running")
					return
				}
				maxLoad := num(obj(run["snapshot"]), "maxRps")
				target := num(input, "rps")
				if target < 1 || target > maxLoad {
					workspaceError(out, 400, "load_out_of_range")
					return
				}
				run["targetRps"] = target
				run["loadRevision"] = num(run, "loadRevision") + 1
				w.addRunEvent(run, "info", fmt.Sprintf("Load revision %.0f: target updated to %.0f req/s", num(run, "loadRevision"), target))
			case "baseline":
				for _, x := range w.data["runs"] {
					if str(x, "projectId") == str(run, "projectId") {
						x["baseline"] = false
					}
				}
				run["baseline"] = true
			default:
				workspaceError(out, 404, "not_found")
				return
			}
			w.audit(user, "run."+p[2], str(run, "id"))
			w.save()
			reply(out, 200, publicRecord(run))
			return
		}
	}
	if len(p) >= 2 && p[0] == "terminals" && len(p) == 3 && p[2] == "command" && r.Method == "POST" {
		var input Obj
		if !workspaceDecode(out, r, &input) {
			return
		}
		result, err := w.command(user, p[1], str(input, "command"))
		if err != nil {
			workspaceError(out, 400, err.Error())
			return
		}
		w.save()
		reply(out, 200, result)
		return
	}
	if len(p) >= 2 && r.Method == "POST" && len(p) == 3 && p[2] == "action" {
		var input Obj
		if !workspaceDecode(out, r, &input) {
			return
		}
		item := w.find(p[0], p[1])
		if item == nil {
			workspaceError(out, 404, "not_found")
			return
		}
		if !w.allowed(user, str(item, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		result, err := w.action(user, p[0], item, input)
		if err != nil {
			workspaceError(out, 400, err.Error())
			return
		}
		w.audit(user, p[0]+"."+str(input, "action"), p[1])
		w.save()
		reply(out, 200, result)
		return
	}
	kind := p[0]
	if !has(collections, kind) {
		workspaceError(out, 404, "not_found")
		return
	}
	if r.Method == "GET" {
		data := w.public(user)[kind]
		if len(p) == 2 {
			for _, o := range data {
				if str(o, "id") == p[1] {
					reply(out, 200, o)
					return
				}
			}
			workspaceError(out, 404, "not_found")
			return
		}
		reply(out, 200, data)
		return
	}
	if has([]string{"audit", "runs", "pods", "occurrences", "alerts", "deliveries"}, kind) {
		workspaceError(out, 405, "operation_not_allowed")
		return
	}
	if r.Method == "DELETE" && len(p) == 2 {
		item := w.find(kind, p[1])
		if item == nil {
			workspaceError(out, 404, "not_found")
			return
		}
		if !w.allowed(user, str(item, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if err := w.canDelete(kind, item, user); err != nil {
			workspaceError(out, 409, err.Error())
			return
		}
		before := clone(w.data)
		for i, o := range w.data[kind] {
			if str(o, "id") == p[1] {
				w.data[kind] = append(w.data[kind][:i], w.data[kind][i+1:]...)
				break
			}
		}
		w.audit(user, kind+".delete", p[1])
		if err := w.save(); err != nil {
			w.data = before
			workspaceError(out, 500, "storage_failed")
			return
		}
		reply(out, 200, Obj{"ok": true})
		return
	}
	if r.Method == "POST" {
		var o Obj
		if !workspaceDecode(out, r, &o) {
			return
		}
		if !w.allowed(user, str(o, "projectId")) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		before := clone(w.data)
		if !w.policyAllowed(user, kind+".write", o) {
			workspaceError(out, 403, "permission_denied")
			return
		}
		if err := w.upsert(user, kind, o); err != nil {
			w.data = before
			workspaceError(out, 400, err.Error())
			return
		}
		w.audit(user, kind+".save", str(o, "id"))
		if err := w.save(); err != nil {
			w.data = before
			workspaceError(out, 500, "storage_failed")
			return
		}
		safe := clone(o)
		delete(safe, "passwordHash")
		if kind == "environments" {
			for _, v := range arr(safe["variables"]) {
				if flag(v, "secret") {
					v["value"] = "••••••••"
				}
			}
		}
		reply(out, 200, safe)
		return
	}
	workspaceError(out, 405, "operation_not_allowed")
}

func (w *Workspace) upsert(user Obj, kind string, o Obj) error {
	old := w.find(kind, str(o, "id"))
	if old != nil {
		if !w.allowed(user, str(old, "projectId")) {
			return errors.New("permission_denied")
		}
		if num(o, "version") != num(old, "version") {
			return errors.New("version_conflict")
		}
		o["createdAt"] = old["createdAt"]
	}
	if str(o, "name") == "" && kind != "dashboards" {
		return errors.New("name_required")
	}
	if len(str(o, "name")) > 150 {
		return errors.New("name_too_long")
	}
	if pid := str(o, "projectId"); pid != "" && w.find("projects", pid) == nil {
		return errors.New("project_not_found")
	}
	switch kind {
	case "policies":
		if !has([]string{"allow", "deny"}, str(o, "effect")) || str(o, "action") == "" || str(o, "subject") == "" {
			return errors.New("invalid_policy")
		}
		if str(o, "projectId") == "*" {
			delete(o, "projectId")
		}
	case "scenarios":
		if err := w.validateScenario(o); err != nil {
			return err
		}
	case "resources":
		if !has([]string{"simulator", "local"}, str(o, "provider")) {
			return errors.New("provider_not_supported")
		}
		if w.find("groups", str(o, "groupId")) == nil {
			return errors.New("group_not_found")
		}
		if num(o, "capacity") < 1 || num(o, "capacity") > 100000 {
			return errors.New("invalid_capacity")
		}
		if old == nil {
			o["status"] = "pending"
			o["allocated"] = 0
			o["cpu"] = 0
			o["memory"] = 0
		}
		if old != nil {
			o["allocated"] = old["allocated"]
			o["status"] = old["status"]
		}
	case "clusters":
		if str(o, "endpoint") == "" {
			return errors.New("endpoint_required")
		}
		o["provider"] = "simulator"
		if old == nil {
			o["status"] = "pending"
		}
	case "groups":
		if num(o, "maxNodes") < 1 || num(o, "maxNodes") > 100 {
			return errors.New("invalid_capacity")
		}
	case "files":
		if err := validateFile(o); err != nil {
			return err
		}
		sum := sha256.Sum256([]byte(str(o, "content")))
		o["hash"] = hex.EncodeToString(sum[:])
		o["size"] = len(str(o, "content"))
	case "environments":
		for _, v := range arr(o["variables"]) {
			if str(v, "name") == "" {
				return errors.New("variable_name_required")
			}
			if flag(v, "secret") {
				if str(v, "value") == "••••••••" && old != nil {
					for _, ov := range arr(old["variables"]) {
						if str(ov, "name") == str(v, "name") {
							v["value"] = ov["value"]
						}
					}
				} else {
					v["value"] = w.encrypt(str(v, "value"))
				}
			}
		}
	case "schedules":
		scene := w.find("scenarios", str(o, "scenarioId"))
		if scene == nil || str(scene, "projectId") != str(o, "projectId") {
			return errors.New("scenario_not_found")
		}
		next, err := nextOccurrences(o, time.Now(), 1)
		if err != nil || len(next) == 0 {
			return errors.New("invalid_schedule")
		}
		o["nextAt"] = next[0]
		o["snapshot"] = clone(scene)
		if str(o, "status") == "" {
			o["status"] = "enabled"
		}
	case "users":
		if !has([]string{"admin", "engineer", "operator", "viewer"}, str(o, "role")) {
			return errors.New("invalid_role")
		}
		if !strings.Contains(str(o, "email"), "@") {
			return errors.New("invalid_email")
		}
		for _, u := range w.data["users"] {
			if str(u, "email") == str(o, "email") && str(u, "id") != str(o, "id") {
				return errors.New("email_exists")
			}
		}
		if str(o, "password") != "" {
			if len(str(o, "password")) < 10 {
				return errors.New("password_too_short")
			}
			h, _ := bcrypt.GenerateFromPassword([]byte(str(o, "password")), bcrypt.DefaultCost)
			o["passwordHash"] = string(h)
		} else if old != nil {
			o["passwordHash"] = old["passwordHash"]
		} else {
			return errors.New("password_required")
		}
		delete(o, "password")
		if old != nil && str(old, "role") == "admin" && (str(o, "role") != "admin" || str(o, "status") == "suspended") {
			count := 0
			for _, u := range w.data["users"] {
				if str(u, "role") == "admin" && str(u, "status") != "suspended" {
					count++
				}
			}
			if count <= 1 {
				return errors.New("last_admin_required")
			}
		}
	case "recordings":
		if str(o, "format") == "har" {
			steps, err := parseHAR(str(o, "content"))
			if err != nil {
				return err
			}
			o["requests"] = steps
			o["status"] = "captured"
			delete(o, "content")
		}
	case "terminals":
		if !has([]string{"admin", "operator"}, str(user, "role")) {
			return errors.New("permission_denied")
		}
		target := w.find("resources", str(o, "resourceId"))
		if target == nil {
			target = w.find("pods", str(o, "resourceId"))
		}
		if target == nil {
			return errors.New("resource_not_found")
		}
		if has([]string{"offline", "failed", "pending", "released"}, str(target, "status")) {
			return errors.New("resource_unavailable")
		}
		o["ownerId"] = str(user, "id")
		o["cwd"] = "/workspace"
		o["status"] = "connected"
		o["expiresAt"] = time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
		o["history"] = []Obj{}
		o["provider"] = target["provider"]
	}
	if old == nil {
		o["id"] = uid(strings.TrimSuffix(kind, "s"))
		o["version"] = 1
		w.push(kind, o)
	} else {
		o["version"] = num(old, "version") + 1
		o["updatedAt"] = now()
		for i, v := range w.data[kind] {
			if str(v, "id") == str(o, "id") {
				w.data[kind][i] = o
				break
			}
		}
	}
	return nil
}
func (w *Workspace) canDelete(kind string, o, user Obj) error {
	if kind == "users" && str(o, "id") == str(user, "id") {
		return errors.New("cannot_delete_self")
	}
	if kind == "projects" {
		for _, s := range w.data["scenarios"] {
			if str(s, "projectId") == str(o, "id") {
				return errors.New("project_has_scenarios")
			}
		}
	}
	if kind == "resources" && num(o, "allocated") > 0 {
		return errors.New("resource_in_use")
	}
	if kind == "groups" {
		for _, r := range w.data["resources"] {
			if str(r, "groupId") == str(o, "id") {
				return errors.New("group_has_resources")
			}
		}
	}
	if kind == "files" || kind == "environments" || kind == "scenarios" {
		for _, s := range w.data["scenarios"] {
			if kind == "files" && has(stringsOf(s["fileIds"]), str(o, "id")) || kind == "environments" && str(s, "environmentId") == str(o, "id") {
				return errors.New("entity_in_use")
			}
		}
		for _, r := range w.data["runs"] {
			if !terminalState(str(r, "status")) && str(obj(r["snapshot"]), "id") == str(o, "id") {
				return errors.New("entity_in_use")
			}
		}
	}
	return nil
}

// The target service is a real local HTTP endpoint available to the native adapter.
func (w *Workspace) targetAPI(out http.ResponseWriter, r *http.Request) {
	select {
	case <-r.Context().Done():
		return
	case <-time.After(25 * time.Millisecond):
	}
	switch r.URL.Path {
	case "/target-api/auth":
		reply(out, 200, Obj{"token": "workspace-token", "userId": "u-1042"})
	case "/target-api/orders":
		if r.Header.Get("Authorization") != "Bearer workspace-token" {
			reply(out, 401, Obj{"error": "unauthorised"})
			return
		}
		reply(out, 201, Obj{"orderId": "ord-9241", "total": 149.95})
	default:
		reply(out, 200, Obj{"ok": true, "id": "p-101", "price": 149.95, "data": Obj{"id": "item-42", "items": []string{"desk", "chair"}}})
	}
}
func byNewest(items []Obj) {
	sort.SliceStable(items, func(i, j int) bool { return str(items[i], "createdAt") > str(items[j], "createdAt") })
}
func secondsSince(s string) float64 {
	t, _ := time.Parse(time.RFC3339Nano, s)
	return time.Since(t).Seconds()
}
func parseInt(s string) int { n, _ := strconv.Atoi(s); return n }

var _ = context.Background
