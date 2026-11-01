# Curation pilot: single vs controller vs collective

Generated 2026-11-01T16:41:40.184Z. Inputs frozen 2026-11-01T16:38:56.526Z (cap $0.234/bundle = 4× single-arm median; rule hash `8a4f912be128`). Model claude-sonnet-5-5 for every agent.

Human labels: 14 paper-qa bundles, labeler(s): Justin. **Single labeler: no human-to-human agreement ceiling is available** (only 1 bundle has a second label: pr293-issue292).
Shared comparison: 11 bundles where every arm stayed within the cap. Bootstrap CIs resample bundles (B=2000).

| Arm | Items | Accuracy [95% CI] | κ [95% CI] | weighted κ | within ±1 | Fairness agree | Mean $/bundle | Acc per $ |
|---|---|---|---|---|---|---|---|---|
| d9 | 22 | 0.55 [0.31, 0.77] | 0.35 [0.05, 0.59] | 0.33 | 0.73 | — | 0.002 | 225.2 |
| single | 22 | 0.55 [0.31, 0.77] | 0.34 [0.05, 0.59] | 0.39 | 0.77 | 0.36 | 0.049 | 11.1 |
| controller | 22 | 0.64 [0.44, 0.83] | 0.46 [0.21, 0.68] | 0.41 | 0.82 | 0.55 | 0.032 | 20.2 |
| collective | 22 | 0.59 [0.37, 0.82] | 0.40 [0.12, 0.64] | 0.32 | 0.73 | 0.45 | 0.170 | 3.5 |

`d9` is the existing `leaks.json` classifier output (leak levels only), shown for reference.

## Secondary: all labeled bundles, including over-budget partial outputs

Excluding over-budget bundles drops the largest threads (28 of 50 items), which skews the shared comparison toward easy bundles. Here every arm is scored on all 14 bundles; the collective's over-budget outputs are partial (later calls were blocked by the cap).

| Arm | Items | Accuracy [95% CI] | κ [95% CI] | weighted κ | within ±1 | Fairness agree | Mean $/bundle |
|---|---|---|---|---|---|---|---|
| d9 | 50 | 0.52 [0.37, 0.67] | 0.34 [0.18, 0.48] | 0.40 | 0.80 | — | 0.002 |
| single | 50 | 0.50 [0.35, 0.67] | 0.31 [0.15, 0.47] | 0.41 | 0.82 | 0.36 | 0.060 |
| controller | 50 | 0.54 [0.44, 0.69] | 0.36 [0.25, 0.52] | 0.42 | 0.84 | 0.57 | 0.032 |
| collective | 50 | 0.52 [0.39, 0.69] | 0.32 [0.20, 0.51] | 0.35 | 0.80 | 0.57 | 0.222 |

| Contrast (all bundles) | Δκ | 95% CI |
|---|---|---|
| collective - single | 0.02 | [-0.05, 0.14] |
| collective - controller | -0.03 | [-0.12, 0.06] |
| controller - single | 0.05 | [-0.05, 0.18] |

## κ differences (shared bundles, same resamples)

| Contrast | Δκ | 95% CI |
|---|---|---|
| collective - single | 0.06 | [-0.03, 0.20] |
| collective - controller | -0.06 | [-0.19, 0.02] |
| controller - single | 0.12 | [0.00, 0.30] |

## Per-role vote accuracy (collective arm, vs human)

| Role | Votes | Accuracy | Higher than human | Lower than human |
|---|---|---|---|---|
| issue_reader | 29 | 0.45 | 6 | 10 |
| gold_comparer_round1 | 50 | 0.48 | 13 | 13 |
| gold_comparer | 50 | 0.48 | 13 | 13 |
| test_auditor | 50 | 0.52 | 10 | 14 |

## Exclusions

- single: 0
- controller: 0
- collective: 3 (pr1029-issue1005 (over-budget), pr1186-issue1165 (over-budget), pr1298-issue1273 (over-budget))

## Blind localization by prompt variant (issue reader, by-product)

Of 14 bundles, the issue reader named every reference file from: body 8, body+human 9, body+all 9.

## Caveats

- Pilot power: 11 bundles; only κ differences of roughly 0.25 or more are likely detectable.
- One model for every agent: the comparison varies evidence and organization, not models.
- Outputs live outside the bundle dirs (not yet frozen into bundle hashes; task 2.5).
