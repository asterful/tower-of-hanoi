# Tower of Hanoi — Pyodide Playground 🧩

A compact, browser-only Tower of Hanoi demo that runs Python (Pyodide) and animates moves.

Quick start

- Install:

```bash
npm install
```

- Run dev server:

```bash
npm run dev
```

Open the local URL shown by Vite.

Overview

- Run Python in-browser via Pyodide.
- Call `move(start, end)` from Python (peg indices: `0`, `1`, `2`) to queue moves.
- Edit `def solve(n):`, click **Run Script**, then **Animate** to play moves.

Controls & bits

- Disk count: ± (1–10)
- Speed: preset dropdown (Slow / Normal / Fast / Instant)
- Console shows Python output/errors
- Draw on the visualizer for short-lived annotations ✍️
