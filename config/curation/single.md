
You also have the hidden tests (applied after the agent finishes), the validation results, and the commit history of the touched files up to the base commit. Additionally decide:
- fairness: do the FAIL_TO_PASS tests check only behavior the issue describes? `fair`, `unfair` or `unsure`, with a reason.
- eligibility (advisory only): scored tests you think should be excluded, and whether tests appear to need live network/API access.
- difficulty: `easy`, `medium` or `hard` for a competent developer with the repository, the issue and no fix.
