# @ogdakke/measure

Measure and compare command execution times across machines.

> [!IMPORTANT]
> This tool makes no guarantees on absolute timings of commands, and is strictly intended for comparing similar commands across multiple different machines.

```bash
bunx @ogdakke/measure --help
```

## Requirements

- [Bun](https://bun.com) `>=1.3.12`

If you are restricted to npm usage only, you can install bun with
```bash
npm i -g bun
```

## Install

```bash
bun add -g @ogdakke/measure@latest
measure --help
```

Or run it without installing globally:

```bash
bunx @ogdakke/measure --help
```

`bunx` is the preferred runner. `npx` works on machines that already have Bun installed.

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
If you want to keep a long-running command alive, press `Ctrl+B` to move it into the background shells panel,
then use the shells UI below the prompt to inspect logs or stop it later.
The prompt also surfaces inline history suggestions from your current session, `measure` history, and
shell history. Press `Right` or `Tab` to accept a suggestion, and use `Ctrl+R` to open fuzzy history search.

## Development

Install dependencies:

```bash
bun install
```

Run locally:

```bash
bun dev
```

Run tests:

```bash
bun test
```

Run the full verification pass:

```bash
bun run lint:all
```
