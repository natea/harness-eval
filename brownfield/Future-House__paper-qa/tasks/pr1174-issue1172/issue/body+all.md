# file_location empty when manifest not set

_Opened by @lucky0218_

The `file_location` attribute is None when executing `paper_search` if manifest is not explicitly set. (not set by default) 
```
        all_doc_details: list[DocDetails] = []
        for r in results:
            # there's only one doc per result, so just take the first one
            this_doc_details = cast("DocDetails", next(iter(r.docs.values())))
            # check if DocDetails have the attribute 'file_location' before appending, personnally added for debug
            if hasattr(this_doc_details, 'file_location'):
                print("file_location:", this_doc_details.file_location)  --> This gets None
            all_doc_details.append(this_doc_details)
            await state.docs.aadd_texts(
                texts=r.texts,
                doc=this_doc_details,
                settings=self.settings,
                embedding_model=self.embedding_model,
            )
```
Is this an expected behavior?

---

## Discussion

**@dosubot** (bot) (2025-11-02):

<!-- Answer -->
Yes, this is expected behavior. The file_location attribute in DocDetails is optional and defaults to None unless it is set explicitly, typically via a manifest CSV file. If you don't provide a manifest, no additional metadata (including file_location) is added, so the attribute remains None by design. This is supported by both the code and the settings documentation, which state that the manifest is optional and only certain fields (like file_location) are used when present for indexing and metadata enrichment. You can see this in the code for DocDetails and how manifest handling works in the indexing pipeline ([source 1](https://github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/types.py#L396-L886), [source 2](https://github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/settings.py#L412-L485)).


<!-- Dosu Comment Footer -->
*To reply, just mention [@dosu](https://go.dosu.dev/dosubot).*

---
<sup>How did I do? [Good](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=great_response) | [Irrelevant](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=irrelevant_answer) | [Incorrect](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=incorrect_sources) | [Verbose](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=too_verbose) | [Hallucination](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=hallucination) | [Report 🐛](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=bug_report) | [Other](https://app.dosu.dev/response-feedback/580438cd-cda9-44f0-9e4b-ece3c02e1e62?feedback_type=other)</sup>&nbsp;&nbsp;[![Chat with Dosu](assets/58edc5b4256c.svg)](https://app.dosu.dev/0e493df4-ff8c-42a6-a866-71a34b293513/ask?utm_source=github)&nbsp;[![Join Discord](assets/40b384e75d82.svg)](https://go.dosu.dev/discord-bot)&nbsp;[![Share on X](assets/07c40f3784fa.svg)](https://twitter.com/intent/tweet?text=%40dosu_ai%20helped%20me%20solve%20this%20issue!&url=https%3A//github.com/Future-House/paper-qa/issues/1172)

**@jamesbraza** (2025-11-02):

Hi @lucky0218 thanks for the issue, I see the problem, we're throwing away `file_location` if there's not a manifest. Nice catch.

I will have a fix out the door tomorrow, but if you need a quick fix now, around https://github.com/Future-House/paper-qa/blob/v5.29.1/src/paperqa/agents/search.py#L522-L527 just do:

```python
await tmp_docs.aadd(
    path=abs_file_path,
    fields=["title", "author", "journal", "year"],
    settings=settings,
    file_location=kwargs.pop("file_location", file_location),
    **kwargs,
)
```
