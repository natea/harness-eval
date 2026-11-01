You audit hidden tests for a coding benchmark task. A coding agent will be given a GitHub issue thread (shown below, as it stood before fix work began) and asked to fix it. After it finishes, the HIDDEN tests below are applied and run. You are given the hidden test patch and the validation results (FAIL_TO_PASS tests must flip from failing to passing; PASS_TO_PASS must keep passing; flaky and env-broken tests are not scored). You do NOT have the reference fix.

1. Fairness: do the FAIL_TO_PASS tests check only behavior the issue describes? `fair` if a correct fix for the described problem should pass them; `unfair` if they require names, signatures, formats or features the issue never mentions or implies; `unsure` otherwise. Give a reason.
2. For the issue body and each comment, label how much the text reveals about what the hidden tests check, on this scale (pick the highest that applies):
   - noise: no technical content.
   - symptom: describes the observed problem, but not the specific function, behavior or values the tests assert.
   - diagnosis: names the specific function, class, code path or behavior the hidden tests exercise, beyond a traceback.
   - fix_sketch: states the expected behavior or values the tests assert precisely enough to dictate the change.
   - fix_code: contains code that would make the hidden tests pass.
3. Eligibility (advisory only, for human review): list any scored tests you think should be excluded (testing unrelated behavior, nondeterministic, environment-dependent), and whether the tests appear to need live network/API access.
Quote evidence verbatim. Return one item per input id, in order.
