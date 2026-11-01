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

**@dosubot** (bot) (2025-11-01):

<!-- Greeting -->
Hi @lucky0218! I'm [Dosu](https://go.dosu.dev/dosubot) and I’m helping the paper-qa team.

<!-- Answer -->
You're right—currently, the `aquery` function does not deduplicate text contexts before filtering, so the same context can appear multiple times in the final selection. This isn't documented as an intentional feature or a bug, but it looks like an oversight since deduplication is implemented for media (images, tables) but not for text contexts. There are no utilities or patterns in the codebase that handle deduplication of text contexts at this stage, and no prior discussions or documentation address this behavior. Introducing a deduplication step before filtering would likely improve answer quality and prevent redundant citations. For reference, see the recent work on media deduplication in [PR #1153](https://github.com/Future-House/paper-qa/pull/1153).


<!-- Dosu Comment Footer -->
*To reply, just mention [@dosu](https://go.dosu.dev/dosubot).*

---
<sup>How did I do? [Good](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=great_response) | [Irrelevant](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=irrelevant_answer) | [Incorrect](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=incorrect_sources) | [Verbose](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=too_verbose) | [Hallucination](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=hallucination) | [Report 🐛](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=bug_report) | [Other](https://app.dosu.dev/response-feedback/26dfc021-bfc2-4225-a073-a6379fa4af3c?feedback_type=other)</sup>&nbsp;&nbsp;[![Chat with Dosu](https://dosu.dev/dosu-chat-badge.svg)](https://app.dosu.dev/0e493df4-ff8c-42a6-a866-71a34b293513/ask?utm_source=github)&nbsp;[![Join Discord](https://img.shields.io/badge/join-5865F2?logo=discord&logoColor=white&label=)](https://go.dosu.dev/discord-bot)&nbsp;[![Share on X](https://img.shields.io/badge/X-share-black)](https://twitter.com/intent/tweet?text=%40dosu_ai%20helped%20me%20solve%20this%20issue!&url=https%3A//github.com/Future-House/paper-qa/issues/1165)

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
