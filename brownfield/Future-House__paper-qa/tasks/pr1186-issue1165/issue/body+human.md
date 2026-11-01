# Duplicate contexts in final session

_Opened by @lucky0218_

Hi!
I want to report a potential enhancement for the `aquery` function. 
When facing complex or multiple questions, there maybe duplicate contexts:
```
        contexts = session.contexts
        if answer_config.get_evidence_if_no_contexts and not contexts:
            session = await self.aget_evidence(
                session,
                callbacks=callbacks,
                settings=settings,
                embedding_model=embedding_model,
                summary_llm_model=summary_llm_model,
                partitioning_fn=partitioning_fn,
            )
            contexts = session.contexts
```
When applying filtering:        
```
filtered_contexts = sorted(
            contexts,
            key=lambda x: (-x.score, x.text.name),
        )[: answer_config.answer_max_sources]
```
One piece of context maybe counted 2 or even more times. 
Not sure this is a feature or a bug.

---

## Discussion

**@jamesbraza** (2025-11-01):

Interesting report, I am curious about it. To share, the `Context`s are independently LLM-constructed, one per retrieved `Text`: https://github.com/Future-House/paper-qa/blob/v5.29.1/src/paperqa/docs.py#L657-L675

In order for the `Context`s to be the same:

1. You'd have to have two of the same `Text` in `Docs`, which we protect against inside `Docs.aadd`/`Docs.aadd_texts`
2. Retrieval fetch the duplicate `Text`s
3. The summary LLM produce the same output given the same input `Text`

Given step 1 above, I am unsure how duplicate `Context` arose for you.

- Perhaps we have an uncaught bug in step 1 above, or your code has some bad logic
- I guess we could deduplicate `Context` at add-time here, just to be safe: https://github.com/Future-House/paper-qa/blob/v5.29.1/src/paperqa/docs.py#L680

Are you able to confirm that there's duplicate `Text`s in your `Docs`? And if so, any ideas on how it happened?

**@lucky0218** (2025-11-02):

After reviewing my code, I find that it's an issue in my customized version. In the original version, one specific `text` maybe summarized for different questions. However, in my customization, I choose to use the original `text` instead of the summarized ones, which contributes to duplicate context in the final answer. Apologies for my carelessness.
