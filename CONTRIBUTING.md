# Contributing to Soul Compiler

Thanks for your interest in contributing. Here's how to get started.

## Ways to Contribute

- **Domain icon references** — thick source materials (2000+ lines) for new people/concepts
- **Trait card extractions** — structured 2K summaries from existing references
- **Web UI improvements** — layout, UX, accessibility, new features
- **Pipeline optimizations** — faster compilation, better conflict detection
- **Language support** — personality compilation in new languages
- **Bug reports** — open an issue with steps to reproduce
- **Documentation** — fix typos, add examples, improve clarity

## Getting Started

```bash
# Clone
git clone https://github.com/kojiltd/soul-compiler.git
cd soul-compiler

# Install dependencies
bun install

# Run Web UI
bun run web/server.ts
# → http://localhost:3000
```

## Submitting Changes

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Test locally (Web UI + pipeline)
5. Commit with a clear message
6. Open a Pull Request

## Code Style

- TypeScript (ESM)
- Keep files concise
- No `any` types — fix root causes
- Brief comments for non-obvious logic

## Adding a Domain Icon Reference

If you want to contribute a new domain icon (e.g., a public figure, philosopher, or concept):

1. Create a source file in `pipeline/sources/<name>/org.md`
2. Include: philosophy, decision cases, quotes, interaction patterns, weaknesses
3. Target 2000-3000 lines — thicker is better
4. Open a PR with the source file

## Reporting Issues

Open an issue at [github.com/kojiltd/soul-compiler/issues](https://github.com/kojiltd/soul-compiler/issues).

Include:
- What you expected
- What happened
- Steps to reproduce
- Environment (OS, Bun version)

## License

By contributing, you agree that your contributions will be licensed under the project's [BSL 1.1](LICENSE) license.
