package studio

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"
)

func unpackProtocols(f Obj) error {
	b, err := base64.StdEncoding.DecodeString(str(f, "content"))
	if err != nil {
		return errors.New("invalid_archive")
	}
	archive, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return errors.New("invalid_archive")
	}
	entries := []Obj{}
	total := int64(0)
	if len(archive.File) > 100 {
		return errors.New("archive_too_large")
	}
	for _, file := range archive.File {
		name := path.Clean(file.Name)
		if strings.HasPrefix(name, "../") || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
			return errors.New("invalid_archive_path")
		}
		if file.FileInfo().IsDir() || !strings.HasSuffix(name, ".proto") && !strings.HasSuffix(name, ".jce") {
			continue
		}
		if file.UncompressedSize64 > 1<<20 {
			return errors.New("archive_too_large")
		}
		reader, err := file.Open()
		if err != nil {
			return err
		}
		data, err := io.ReadAll(io.LimitReader(reader, (1<<20)+1))
		reader.Close()
		if err != nil {
			return err
		}
		total += int64(len(data))
		if total > 4<<20 {
			return errors.New("archive_too_large")
		}
		entries = append(entries, Obj{"name": name, "content": string(data)})
	}
	if len(entries) == 0 {
		return errors.New("protocol_file_required")
	}
	f["entries"] = entries
	f["encoding"] = "base64"
	return nil
}
func bundledFiles(files []Obj) []Obj {
	out := []Obj{}
	for _, f := range files {
		out = append(out, f)
		for _, entry := range arr(f["entries"]) {
			copy := clone(entry)
			copy["id"] = str(f, "id") + ":" + str(entry, "name")
			copy["type"] = "protocol"
			out = append(out, copy)
		}
	}
	return out
}
func validateProtocolImports(files []Obj) error {
	available := map[string]bool{}
	for _, f := range bundledFiles(files) {
		if str(f, "type") == "protocol" {
			available[str(f, "name")] = true
		}
	}
	rx := regexp.MustCompile(`import\s+(?:(?:public|weak)\s+)?"([^"]+)"`)
	for _, f := range bundledFiles(files) {
		if strings.HasSuffix(str(f, "name"), ".proto") {
			for _, m := range rx.FindAllStringSubmatch(str(f, "content"), -1) {
				name := path.Clean(path.Join(path.Dir(str(f, "name")), m[1]))
				if !available[name] && !available[m[1]] && !strings.HasPrefix(m[1], "google/protobuf/") {
					return errors.New("protocol_dependency_missing: " + m[1])
				}
			}
		}
	}
	return nil
}
func (w *Workspace) extractAPI(out http.ResponseWriter, r *http.Request) {
	var in Obj
	if !workspaceDecode(out, r, &in) {
		return
	}
	if str(in, "mode") == "regex" {
		rx, err := regexp.Compile(str(in, "expression"))
		if err != nil {
			workspaceError(out, 400, "invalid_expression")
			return
		}
		reply(out, 200, Obj{"value": rx.FindStringSubmatch(str(in, "body"))})
		return
	}
	value, err := extractValue(in["body"], str(in, "expression"))
	if err != nil {
		workspaceError(out, 400, "path_not_found")
		return
	}
	reply(out, 200, Obj{"value": value})
}
