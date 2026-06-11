# harness-eval

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Results dashboard

```sh
bun run dashboard          # http://127.0.0.1:4870 (localhost-only, read-only)
```

Leaderboard across runs (filter by run; speed/spend flagged as within-run
normalized), per-run scorecards with variance and exclusions, trial
drill-downs (every test-plan step with evidence, judge samples with
justifications, telemetry), a step-comparison matrix, and live re-weighting
sliders that recompute composites client-side via the same scoring module
the CLI uses. Runs with unknown results schema versions are listed with a
regenerate hint instead of rendering.
