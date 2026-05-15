# Solution Junky

A local-first AI chat application built as the software brain for a future "Jarvis-style" desk robot.

Solution Junky runs entirely on your own hardware — no cloud APIs, no data leaving your machine. It's a desktop app built with Tauri (Rust + React/TypeScript) that talks to local AI models through [Ollama](https://ollama.com/), with voice input, conversation memory, and an organized chat workspace.

## Why this exists

This project has two goals running in parallel:

1. **A working tool** — a private, local AI assistant that's actually useful day-to-day, with features that match (and in some cases exceed) commercial chat apps.
2. **A learning vehicle** — a hands-on way to teach myself programming, AI development, and systems architecture as a CIS student.

The longer-term vision is to extend Solution Junky from a desktop app into a physical desk robot — a custom-designed enclosure powered by a Raspberry Pi 5 that talks to the PC-side "brain" over the local network. Think BMO from *Adventure Time*, but as a daily-driver AI workstation companion.

## Features

- **Local AI inference** via Ollama — your conversations never leave your machine
- **Multi-model support** — switch between models per conversation (currently testing `llama3.2:1b`, `llama3.2:3b`, `deepseek-r1:7b`)
- **Voice input** for hands-free interaction
- **Organized workspace** — group chats into folders by topic (Programming, Creative Interests, etc.)
- **Memory system** — facts injected into each turn so the assistant remembers context across conversations
- **Citations panel** — retrieved knowledge chunks shown alongside responses (RAG-ready)
- **Archive & backup** for conversation history
- **Global search** across all chats (`Ctrl+K`)
- **Web search** toggle for grounding responses in current information
- Built as a native desktop app — fast startup, low memory footprint, no Electron bloat

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + TypeScript)      │
│  - Chat UI, model selector, voice   │
│  - Tailwind CSS for styling         │
└──────────────┬──────────────────────┘
               │ Tauri invoke()
┌──────────────▼──────────────────────┐
│  Backend (Rust / src-tauri)         │
│  - Ollama API client                │
│  - File system, audio capture       │
│  - Memory & citation storage        │
└──────────────┬──────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────┐
│  Ollama (local inference)           │
│  - llama3.2, deepseek-r1, etc.      │
│  - nomic-embed-text for embeddings  │
└─────────────────────────────────────┘
```

### Future architecture (Phase 3+)

```
┌──────────────────┐         ┌──────────────────┐
│  Desktop "Brain" │ ◄─────► │  Desk Robot      │
│  (this repo)     │  LAN    │  (Raspberry Pi 5)│
│                  │         │  - Whisper (STT) │
│  - Heavy models  │         │  - Piper (TTS)   │
│  - Knowledge     │         │  - Camera        │
│    base / RAG    │         │  - Custom        │
│                  │         │    enclosure     │
└──────────────────┘         └──────────────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri](https://tauri.app/) |
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend | Rust |
| AI inference | [Ollama](https://ollama.com/) |
| Embeddings | nomic-embed-text |
| Dev assistant | [Continue.dev](https://continue.dev/) in VS Code |

## Getting started

### Prerequisites

- [Rust toolchain](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 18+ and npm
- [Ollama](https://ollama.com/download) installed and running
- At least one model pulled locally:
  ```bash
  ollama pull llama3.2:3b
  ollama pull nomic-embed-text
  ```

### Installation

```bash
# Clone the repo
git clone https://github.com/Xoloatl/Solution-Junky.git
cd Solution-Junky

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

The built binary will be in `src-tauri/target/release/`.

## Hardware notes

Currently developed and tested on:

- **OS:** Windows 11
- **GPU:** Nvidia Quadro M2200 (4GB VRAM) — note: Maxwell architecture has compatibility issues with current CUDA + Ollama builds, so inference runs in CPU mode on this machine
- **Recommended:** Any modern GPU with 8GB+ VRAM will give significantly better performance, especially for 7B+ models

## Roadmap

- [x] **Phase 1:** Core chat interface, Ollama integration, model switching
- [x] **Phase 2A:** Voice input
- [ ] **Phase 2B:** Voice output (TTS)
- [ ] **Phase 3:** RAG / knowledge base over local documents
- [ ] **Phase 4:** Tool use — function calling, web search, file system access
- [ ] **Phase 5:** Raspberry Pi 5 companion device + custom enclosure
- [ ] **Phase 6:** Computer vision integration

## Status

🚧 Active development. This is a personal learning project, not production software. Expect rough edges and breaking changes.

## License

TBD
