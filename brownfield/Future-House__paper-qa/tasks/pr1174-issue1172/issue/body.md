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
