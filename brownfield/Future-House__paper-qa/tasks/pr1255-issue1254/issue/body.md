# Pydantic validation error when using custom settings

_Opened by @kirillkoncha_

Hi! Thank you for fixes, now importing filename from config name works fine. However, another issue is raised, when I am trying to set myself a custom config. For example:
```python3
from paperqa.settings import (
    AgentSettings,
    AnswerSettings,
    IndexSettings,
    ParsingSettings,
    PromptSettings,
    Settings,
)
settings=Settings(
    AnswerSettings(
        evidence_k=10,
        evidence_detailed_citations=True,
        evidence_retrieval=True,
        evidence_summary_length="about 100 words",
        evidence_skip_summary=False,
        answer_max_sources=5,
        max_answer_attempts=None,
        answer_length="must not exceed 1000 words, but sometimes can be longer",
        max_concurrent_requests=10,
    )
)
```

Raises this pydantic error:
```
ValidationError: 1 validation error for AnswerSettings
evidence_detailed_citations
  Extra inputs are not permitted [type=extra_forbidden, input_value=True, input_type=bool]
    For further information visit https://errors.pydantic.dev/2.12/v/extra_forbidden
```

Also put it as comment in the PR: https://github.com/Future-House/paper-qa/pull/1251#issuecomment-3686104549
