# v3: 'Docs' object has no attribute 'doc_index'

_Opened by @rht_

I did use the latest release of Paper QA (2.1.1), and it worked great. Then I upgraded to the latest Git version (https://github.com/whitead/paper-qa/commit/e0d6e219f577acf9955ca864024d2edbf8d55efc). I tried customizing the QA prompt, and upon running `docs.query()`, I got this traceback:
```console
  File "bot.py", line 16, in get_answer
    return docs.query(question).formatted_answer
  File "/srv/zulip-py3-venv/lib/python3.8/site-packages/paperqa/docs.py", line 451, in query
    return loop.run_until_complete(
  File "/usr/lib/python3.8/asyncio/base_events.py", line 616, in run_until_complete
    return future.result()
  File "/srv/zulip-py3-venv/lib/python3.8/site-packages/paperqa/docs.py", line 483, in aquery
    keys = await self.adoc_match(
  File "/srv/zulip-py3-venv/lib/python3.8/site-packages/paperqa/docs.py", line 254, in adoc_match
    if self.doc_index is None:
AttributeError: 'Docs' object has no attribute 'doc_index'
```
I have noticed that the code in the README.md is still on v2, evident from the `docs.add` that still uses the `key` argument. I might be using v2-specific code that caused the error, but I couldn't figure out what it is.

My code:
```python
my_qaprompt = PromptTemplate(
    input_variables=["context", "question"],
    template=template,
)
prompts=PromptCollection(qa=my_qaprompt)

docs = Docs(prompts=prompts)
for f in source_files:
    print(f)
    # this assumes the file names are unique in code
    try:
        docs.add(f, citation='File ' + f)
    except IndexError:
        continue
with open("pickled.pickle", "wb") as f:
    pickle.dump(docs, f)
with open("pickled.pickle", "rb") as f:
    docs = pickle.load(f)
print(docs.query(question).formatted_answer)
```
