# `litellm_get_search_query` does not use a local llm config

_Opened by @migalkin_

In the standard `ask` pipeline, the function `litellm_get_search_query` does not employ custom llm settings config available in `query.settings.llm_config`:

https://github.com/Future-House/paper-qa/blob/e49f1af67e5463ee5188cbe20bdb9747f14db1f9/paperqa/agents/main.py#L178-L180

This leads to creating a default LiteLLMModel instance which by default calls some public endpoint (eg, OpenAI one)

https://github.com/Future-House/paper-qa/blob/e49f1af67e5463ee5188cbe20bdb9747f14db1f9/paperqa/agents/helpers.py#L54-L55

I found this behavior after setting all `llm_config`, `summary_llm_config` and `agent_llm_config` pointing to a custom (local) vLLM endpoint, but PaperQA always calls some hardcoded open endpoint at this step and fails because those endpoints don't recognize custom model names. 

I managed to solve this by patching `litellm_get_search_query` to accept a config dict and using it in the `LiteLLMModel` initialization:
```python
for search in await litellm_get_search_query(
        question, llm=query.settings.llm, count=3, config=query.settings.llm_config
    ):
```
and 
```python
model = LiteLLMModel(name=llm, config=config)
```

Is this a bug (I can submit a PR if you'd like) or a feature of the fake agent? 🤔

---

## Discussion

**@jamesbraza** (2024-10-11):

Hi @migalkin thanks for the issue and nice spot, I follow what you're saying. Feel free to open a PR for this 👍 

Looks like the same thing happens in `AnswerResponse.get_summary`.

Let's call this a bug because we advertise as working for local LLMs
