# Warning that paper_directory input argument moved from Settings to AgentSettings but not working with AgentSettings

_Opened by @gdurif_

Hi,

Using latest release (`v5.25.0`) or previous one (`v5.24.0`), when I pass the input argument `paper_directory` to `paperqa.settings.Settings()` function, I get a `DeprecationWarning` stating that I should pass it to `paperqa.settings.AgentSettings()`:
```
/xxx/.venv/lib/python3.12/site-packages/pydantic/main.py:253: DeprecationWarning: The 'paper_directory' field has been moved to AgentSettings, this deprecation will conclude in version 6.
    validated_self = self.__pydantic_validator__.validate_python(data, self_instance=self)
```

However, if I pass the input argument `paper_directory` to `paperqa.settings.AgentSettings()`, I get an error:
```
Traceback (most recent call last):
  File "issue_paper_directory_input_paperqa.py", line 20, in <module>
    agent = AgentSettings(
            ^^^^^^^^^^^^^^
  File "/xxx/.venv/lib/python3.12/site-packages/pydantic/main.py", line 253, in __init__
    validated_self = self.__pydantic_validator__.validate_python(data, self_instance=self)
                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
pydantic_core._pydantic_core.ValidationError: 1 validation error for AgentSettings
paper_directory
  Extra inputs are not permitted [type=extra_forbidden, input_value='.', input_type=str]
    For further information visit https://errors.pydantic.dev/2.11/v/extra_forbidden
```

MWE (warning):
```python
from paperqa.settings import (
    AgentSettings, IndexSettings, ParsingSettings, Settings
)

# local LLM config (no issue)
local_llm_config = dict(
    model_list=[
        dict(
            model_name="ollama/llama3.2",
            litellm_params=dict(
                model="ollama/llama3.2",
                api_base="http://localhost:11434",
                timeout=600,
            ),
        )
    ]
)

# agent setting (no paper directory)
agent = AgentSettings(
    agent_llm="ollama/llama3.2",
    agent_llm_config=local_llm_config,
    index=IndexSettings(
        index_directory=".",
        manifest_file="./manifest.csv",
        concurrency=1,
    ),
    timeout=600,
    search_count=1
)

# global setting
settings = Settings(
    temperature=0.1,
    llm="ollama/llama3.2",
    llm_config=local_llm_config,
    summary_llm="ollama/llama3.2",
    summary_llm_config=local_llm_config,
    embedding="ollama/mxbai-embed-large",
    agent=agent,
    parsing=ParsingSettings(
        use_doc_details=False,
    ),
    paper_directory=".",
    verbosity=0
)
```

MWE (error):
```python
from paperqa.settings import (
    AgentSettings, IndexSettings, ParsingSettings, Settings
)

# local LLM config (no issue)
local_llm_config = dict(
    model_list=[
        dict(
            model_name="ollama/llama3.2",
            litellm_params=dict(
                model="ollama/llama3.2",
                api_base="http://localhost:11434",
                timeout=600,
            ),
        )
    ]
)

# agent setting (no paper directory)
agent = AgentSettings(
    agent_llm="ollama/llama3.2",
    agent_llm_config=local_llm_config,
    index=IndexSettings(
        index_directory=".",
        manifest_file="./manifest.csv",
        concurrency=1,
    ),
    paper_directory=".",
    timeout=600,
    search_count=1
)

# global setting
settings = Settings(
    temperature=0.1,
    llm="ollama/llama3.2",
    llm_config=local_llm_config,
    summary_llm="ollama/llama3.2",
    summary_llm_config=local_llm_config,
    embedding="ollama/mxbai-embed-large",
    agent=agent,
    parsing=ParsingSettings(
        use_doc_details=False,
    ),
    verbosity=0
)
```
