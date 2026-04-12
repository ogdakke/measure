# @ogdakke/measure

Measure and compare command execution times across machines.

```bash
bunx @ogdakke/measure --help
```

## Requirements

- [Bun](https://bun.com) `>=1.3.12`

## Install

```bash
bun add -g @ogdakke/measure
```

Or run it without installing globally:

```bash
bunx @ogdakke/measure --help
```

## Usage

Measure a one-off command:

```bash
measure run bun test
```

Benchmark a command across multiple runs:

```bash
measure bench -n 20 bun test
```

Browse recent measurements:

```bash
measure history --limit 10
```

Open the interactive REPL:

```bash
measure
```

The REPL is best for one-off commands. If you accidentally start an interactive or long-running command like
`cat`, `git add -p`, or `bun run dev`, press `Esc` to cancel the child process and return to the REPL.

## Development

Install dependencies:

```bash
bun install
```

Run locally:

```bash
bun run src/index.ts
```

Run tests:

```bash
bun test
```
