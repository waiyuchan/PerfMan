package studio

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/mattn/go-sqlite3"
)

func init() {
	sql.Register("perfman-fixture", &sqlite3.SQLiteDriver{ConnectHook: func(conn *sqlite3.SQLiteConn) error {
		conn.SetLimit(sqlite3.SQLITE_LIMIT_LENGTH, 1<<20)
		conn.SetLimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 64<<10)
		conn.SetLimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
		conn.RegisterAuthorizer(func(op int, a, b, database string) int {
			if op == sqlite3.SQLITE_ATTACH || op == sqlite3.SQLITE_DETACH || op == sqlite3.SQLITE_PRAGMA {
				return sqlite3.SQLITE_DENY
			}
			if op == sqlite3.SQLITE_FUNCTION && (strings.EqualFold(b, "load_extension") || strings.EqualFold(b, "readfile") || strings.EqualFold(b, "writefile")) {
				return sqlite3.SQLITE_DENY
			}
			return sqlite3.SQLITE_OK
		})
		return nil
	}})
}

func (e *evaluation) fixtureDB(vm *goja.Runtime, key string) *sql.DB {
	if e.Databases == nil {
		e.Databases = map[string]*sql.DB{}
	}
	if db := e.Databases[key]; db != nil {
		return db
	}
	db, err := sql.Open("perfman-fixture", ":memory:")
	if err != nil {
		panic(vm.NewGoError(err))
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,total REAL,status TEXT); INSERT INTO orders VALUES('ord-9241',149.95,'paid'),('ord-9242',89.5,'paid'); CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,age INTEGER);INSERT INTO users VALUES(1,'Avery Chen',28),(2,'Jordan Taylor',31); CREATE TABLE catalog(id TEXT PRIMARY KEY,name TEXT,price REAL);INSERT INTO catalog VALUES('sku-1042','Studio desk',149.95);`)
	if err != nil {
		db.Close()
		panic(vm.NewGoError(err))
	}
	e.Databases[key] = db
	return db
}
func (e *evaluation) sqlModule(vm *goja.Runtime) Obj {
	return Obj{"Database": func(c goja.ConstructorCall) *goja.Object {
		key := c.Argument(0).String() + ":" + c.Argument(1).String()
		db := e.fixtureDB(vm, key)
		c.This.Set("query", func(query string, args ...any) any {
			e.request("SQL", "QUERY", query, "", Obj{})
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			defer cancel()
			rows, err := db.QueryContext(ctx, query, args...)
			if err != nil {
				panic(vm.NewGoError(err))
			}
			defer rows.Close()
			columns, _ := rows.Columns()
			result := []Obj{}
			for rows.Next() && len(result) < 1000 {
				values := make([]any, len(columns))
				refs := make([]any, len(columns))
				for i := range values {
					refs[i] = &values[i]
				}
				if err := rows.Scan(refs...); err != nil {
					panic(vm.NewGoError(err))
				}
				record := Obj{}
				for i, k := range columns {
					v := values[i]
					if b, ok := v.([]byte); ok {
						v = string(b)
					}
					record[k] = v
				}
				result = append(result, record)
			}
			if rows.Err() != nil {
				panic(vm.NewGoError(rows.Err()))
			}
			e.sampleResponse(result)
			return result
		})
		c.This.Set("exec", func(query string, args ...any) any {
			e.request("SQL", "EXEC", query, "", Obj{})
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			defer cancel()
			result, err := db.ExecContext(ctx, query, args...)
			if err != nil {
				panic(vm.NewGoError(err))
			}
			n, _ := result.RowsAffected()
			last, _ := result.LastInsertId()
			response := Obj{"rowsAffected": n, "lastInsertId": last}
			e.sampleResponse(response)
			return response
		})
		c.This.Set("close", func() {})
		return nil
	}}
}
func (e *evaluation) sampleResponse(value any) {
	if len(e.Samples) == 0 {
		return
	}
	b, _ := json.Marshal(value)
	e.Samples[len(e.Samples)-1]["responseBody"] = e.redact(string(b))
}
func (e *evaluation) closeDatabases() {
	for _, db := range e.Databases {
		db.Close()
	}
	e.Databases = nil
}
func (e *evaluation) redisModule(vm *goja.Runtime) Obj {
	return Obj{"Client": func(c goja.ConstructorCall) *goja.Object {
		request := func(command, k string) { e.request("Redis", command, k, "", Obj{}) }
		c.This.Set("set", func(k string, v any) string { request("SET", k); e.Redis[k] = v; return "OK" })
		c.This.Set("get", func(k string) any { request("GET", k); value := e.Redis[k]; e.sampleResponse(value); return value })
		c.This.Set("del", func(k string) int {
			request("DEL", k)
			_, ok := e.Redis[k]
			delete(e.Redis, k)
			if ok {
				return 1
			}
			return 0
		})
		c.This.Set("hset", func(k, f string, v any) int { request("HSET", k); e.Redis[k+":"+f] = v; return 1 })
		c.This.Set("hget", func(k, f string) any { request("HGET", k); return e.Redis[k+":"+f] })
		c.This.Set("hdel", func(k, f string) int {
			request("HDEL", k)
			_, ok := e.Redis[k+":"+f]
			delete(e.Redis, k+":"+f)
			if ok {
				return 1
			}
			return 0
		})
		c.This.Set("lpush", func(k string, values ...any) int {
			request("LPUSH", k)
			list, _ := e.Redis[k].([]any)
			for _, v := range values {
				list = append([]any{v}, list...)
			}
			e.Redis[k] = list
			return len(list)
		})
		c.This.Set("lpop", func(k string) any {
			request("LPOP", k)
			list, _ := e.Redis[k].([]any)
			if len(list) == 0 {
				return nil
			}
			value := list[0]
			e.Redis[k] = list[1:]
			return value
		})
		c.This.Set("llen", func(k string) int { request("LLEN", k); list, _ := e.Redis[k].([]any); return len(list) })
		c.This.Set("sadd", func(k string, values ...any) int {
			request("SADD", k)
			set, _ := e.Redis[k].(map[string]any)
			if set == nil {
				set = map[string]any{}
			}
			added := 0
			for _, v := range values {
				key := fmt.Sprint(v)
				if _, ok := set[key]; !ok {
					set[key] = v
					added++
				}
			}
			e.Redis[k] = set
			return added
		})
		c.This.Set("spop", func(k string) any {
			request("SPOP", k)
			set, _ := e.Redis[k].(map[string]any)
			for key, v := range set {
				delete(set, key)
				return v
			}
			return nil
		})
		c.This.Set("scard", func(k string) int { request("SCARD", k); set, _ := e.Redis[k].(map[string]any); return len(set) })
		c.This.Set("incr", func(k string) int {
			request("INCR", k)
			value := 0
			fmt.Sscan(fmt.Sprint(e.Redis[k]), &value)
			value++
			e.Redis[k] = value
			return value
		})
		c.This.Set("close", func() {})
		return nil
	}}
}
func (e *evaluation) socketModule(vm *goja.Runtime) Obj {
	return Obj{"Conn": func(c goja.ConstructorCall) *goja.Object {
		protocol := strings.ToUpper(c.Argument(0).String())
		address := c.Argument(1).String()
		buffer := "PONG"
		closed := false
		c.This.Set("write", func(value string) int {
			if closed {
				panic(vm.NewGoError(fmt.Errorf("socket closed")))
			}
			e.request(protocol, "WRITE", address, value, Obj{})
			buffer = value
			if strings.TrimSpace(strings.ToUpper(value)) == "PING" {
				buffer = "PONG"
			}
			return len(value)
		})
		c.This.Set("read", func(n int) string {
			if closed {
				panic(vm.NewGoError(fmt.Errorf("socket closed")))
			}
			e.request(protocol, "READ", address, "", Obj{})
			n = min(max(n, 0), len(buffer))
			value := buffer[:n]
			e.sampleResponse(Obj{"data": value, "bytes": n})
			return value
		})
		c.This.Set("close", func() { closed = true })
		return nil
	}}
}
