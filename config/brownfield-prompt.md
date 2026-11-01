You are working in a checkout of the {{REPO}} repository at the commit where the
reported problem still exists. The report is in {{ISSUE_FILE}} in the repository
root; read it first, then fix the problem in this repository.

Work the way you normally would: explore the code, reproduce the problem, make
the change, and run the relevant tests. Your change is judged by the project's
own test suite, including tests you cannot see, so aim for the correct fix rather
than a narrow one that only satisfies the visible tests.

Rules:
- Work only inside this repository.
- Do not consult upstream history, pull requests, issues, releases, or any
  network copy of this project beyond what is provided here, and do not try to
  find how the problem was fixed upstream. The repository's own past history and
  existing tests are available and may be used.
- Network access is unavailable for live service calls. Tests that rely on
  recorded HTTP fixtures run in playback mode.
- Leave your changes in the working tree when you stop. Commit them if you
  prefer, but do not discard them.
- When you consider the work complete, stop.
