# aiohttp issue, seemingly related to Crossref Search

_Opened by @meefen_

I encountered an error when running the Zotero sample code from the README file. The connection with Zotero worked but it seems paperqa was trying to get more metadata from Crossref and then throw an AttributeError. I have encountered this error when running other workflows, so it's probably related to paperqa's Crossref API calls. 

Python 3.11.8
aiohttp==3.9.5

Any suggestions? 

See the traceback below: 

```
 Metadata not found for Literacy in the Time of Artificial Intelligence in CrossrefProvider.
Traceback (most recent call last):
  File "~/src/zotero_review.py", line 21, in <module>
    docs.add(item.pdf, docname=item.key)
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/docs.py", line 252, in add
    return get_loop().run_until_complete(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/asyncio/base_events.py", line 654, in run_until_complete
    return future.result()
           ^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/docs.py", line 389, in aadd
    doc = await metadata_client.upgrade_doc_to_doc_details(
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/__init__.py", line 214, in upgrade_doc_to_doc_details
    if doc_details := await self.query(**kwargs):
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/__init__.py", line 153, in query
    await gather_with_concurrency(
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/utils.py", line 122, in gather_with_concurrency
    return await asyncio.gather(*(sem_coro(c) for c in coros))
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/utils.py", line 120, in sem_coro
    return await coro
           ^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/client_models.py", line 109, in query
    return await self._query(client_query)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/semantic_scholar.py", line 350, in _query
    return await get_s2_doc_details_from_title(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/semantic_scholar.py", line 335, in get_s2_doc_details_from_title
    return await s2_title_search(
           ^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/semantic_scholar.py", line 238, in s2_title_search
    data = await _s2_get_with_retrying(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/_asyncio.py", line 88, in async_wrapped
    return await fn(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/_asyncio.py", line 47, in __call__
    do = self.iter(retry_state=retry_state)
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/__init__.py", line 314, in iter
    return fut.result()
           ^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/concurrent/futures/_base.py", line 449, in result
    return self.__get_result()
           ^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/concurrent/futures/_base.py", line 401, in __get_result
    raise self._exception
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/_asyncio.py", line 50, in __call__
    result = await fn(*args, **kwargs)
             ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/clients/semantic_scholar.py", line 119, in _s2_get_with_retrying
    return await _get_with_retrying(
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/_asyncio.py", line 88, in async_wrapped
    return await fn(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/_asyncio.py", line 47, in __call__
    do = self.iter(retry_state=retry_state)
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/__init__.py", line 313, in iter
    if not (is_explicit_retry or self.retry(retry_state)):
                                 ^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/tenacity/retry.py", line 76, in __call__
    return self.predicate(exception)
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/paperqa/utils.py", line 439, in is_retryable
    exc, aiohttp.ServerDisconnectedError | aiohttp.ClientConnectionResetError
                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "~/.pyenv/versions/3.11.8/lib/python3.11/site-packages/aiohttp/__init__.py", line 240, in __getattr__
    raise AttributeError(f"module {__name__} has no attribute {name}")
AttributeError: module aiohttp has no attribute ClientConnectionResetError. Did you mean: 'ClientConnectionError'?
Unclosed client session
client_session: <aiohttp.client.ClientSession object at 0x10deee0d0>
Unclosed connector
connections: ['[(<aiohttp.client_proto.ResponseHandler object at 0x123cc49f0>, 218926.715099375)]']
connector: <aiohttp.connector.TCPConnector object at 0x14daf3b90>
```

---

## Discussion

**@dosubot** (bot) (2024-12-11):

<!-- Greeting -->
Hey @meefen! I'm here to help you with your software bugs, questions, and becoming a contributor. Let's tackle this together!

<!-- Answer -->
The error you're encountering is due to the use of an incorrect attribute name from the `aiohttp` module. The `AttributeError` indicates that `aiohttp` does not have an attribute named `ClientConnectionResetError`. Instead, it suggests using `ClientConnectionError`.

To resolve this issue, you should update the `is_retryable` function in `paperqa/utils.py` to use `aiohttp.ClientConnectionError` instead of `aiohttp.ClientConnectionResetError`. Here's how you can modify the relevant part of the code:

```python
def is_retryable(exc: BaseException) -> bool:
    """Check if an exception is known to be a retryable HTTP issue."""
    if isinstance(
        exc, aiohttp.ServerDisconnectedError | aiohttp.ClientConnectionError
    ):
        return True
    return isinstance(exc, aiohttp.ClientResponseError) and exc.status in {
        httpx.codes.INTERNAL_SERVER_ERROR.value,
        httpx.codes.GATEWAY_TIMEOUT.value,
    }
```

This change should fix the `AttributeError` you're experiencing. Additionally, the warning about unclosed client sessions and connectors suggests that there might be an issue with properly closing `aiohttp` sessions. Ensure that all `aiohttp` sessions are properly closed after use to avoid resource leaks.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*

---
<sup>Help Dosu learn! Give it feedback: [Great Response](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=great_response) | [Irrelevant Answer](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=irrelevant_answer) | [Incorrect Sources](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=incorrect_sources) | [Too Verbose](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=too_verbose) | [Hallucination](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=hallucination) | [Other](https://app.dosu.dev/response-feedback/15ab8ff8-43f2-4b1e-8d60-e2628911b4fb?feedback_type=other)</sup>
