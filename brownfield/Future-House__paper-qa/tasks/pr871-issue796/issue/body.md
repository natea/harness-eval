# `gemini-1.5-flash` can't call tools without empty arguments

_Opened by @jamesbraza_

Running the below code on Jan 8th 2025 with Python 3.12 and `litellm==1.53.3`:

```python
import litellm

OPENAI_MODEL = "gpt-4o-2024-11-20"
GEMINI_MODEL = "gemini/gemini-1.5-flash"


response = litellm.completion(
    model=GEMINI_MODEL,
    messages=[
        {"role": "user", "content": "Select a tool to print 'hi'."},
    ],
    tool_choice="required",
    tools=[
        {
            "type": "function",
            "function": {
                "name": "print_hi",
                "description": "Print 'hi'.",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        }
    ],
)
assert len(response.choices) == 1, "Expected one response choice."
print(response.choices[0].message.tool_calls)
```

It works fine with OpenAI `gpt-4o-2024-11-20`, but does not work with Google `gemini/gemini-1.5-flash`:

```none
litellm.exceptions.BadRequestError: litellm.BadRequestError: VertexAIException BadRequestError - {
  "error": {
    "code": 400,
    "message": "* GenerateContentRequest.tools[0].function_declarations[0].parameters.properties: should be non-empty for OBJECT type\n",
    "status": "INVALID_ARGUMENT"
  }
}
```

So Gemini does not yet support empty tool `parameters`.

Unfortunately, PaperQA's `gen_answer` and `reset` tools have empty parameters. Thus, `gemini/gemini-1.5-flash` can't be used for tool selections (our agent LLM).
