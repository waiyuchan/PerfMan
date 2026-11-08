package studio

import "embed"

//go:embed web/*
var Assets embed.FS

//go:embed console/*
var ConsoleAssets embed.FS
