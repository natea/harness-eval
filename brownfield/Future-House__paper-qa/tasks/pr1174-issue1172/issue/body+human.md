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
