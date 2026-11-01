# Documentation in `CONTRIBUTING.md` for `pytest-recording` and VCR cassettes

_Opened by @jamesbraza_

We use `pytest-recording` plugin to make test cassettes to cache HTTP requests, making our unit tests more deterministic.

We need a little blurb in `CONTRIBUTING.md` that:
- Links to `pytest-recording`
- Gives a brief summary on how to record a new VCR using a command like `uv run pytest tests/test_module.py`
- Links the config in `tests/conftest.py` and documents header removals from responses
