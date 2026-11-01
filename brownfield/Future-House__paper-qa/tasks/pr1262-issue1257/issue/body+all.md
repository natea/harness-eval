# pqa tries to index old files every time during 'ask' and if `--agent.rebuild_index false`, it can't find the index

_Opened by @rosegarden-coder_

The current behavior of pqa seems to perform index and create a new folder of `pqa-hashnumber` every time when ask is called:

```
New file to index: paper.pdf...                                                                                                            
...
No changes to index.                                                                                                                               
```
But the paper is not new and it has been already indexed. 

The question is:  If I have already manually performed index, how to make pqa directly use the index and avoid creating a new index dir and try to index it?

I set  `--agent.rebuild_index false`, then it will say "RuntimeError: Index pqa_index_52dd7ee09926ac3c121157bc4635769c was empty, please rebuild it." -- obviously this is an empty index dir it just created and nothing to see there. Why it can't use the previous index+papers (and not taking old papers as new papers?)

---

## Discussion

**@dosubot** (bot) (2025-12-26):

<!-- Answer -->
The reason pqa keeps creating new index directories and fails to reuse your existing index is that the index directory name is generated from the absolute path of your paper directory and key settings like embedding model, chunk size, and chunking algorithm. If any of these change—even using a relative path vs. an absolute path—a new index directory (with a new hash) is created, and your previous index is ignored. When you set `--agent.rebuild_index false`, pqa will only use an existing index if the computed directory already exists and is populated; otherwise, it raises the "Index ... was empty, please rebuild it" error and does not attempt to reuse any other index ([source](https://github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/settings.py#L397-L820), [source](https://github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/agents/search.py#L201-L752)).

To make pqa use your existing index and avoid re-indexing:

- Make sure the paper directory path and all relevant settings (embedding model, chunk size, overlap, chunking algorithm, etc.) are exactly the same as when you built the index. Prefer using absolute paths.
- You can explicitly set the index directory and index name via `settings.agent.index.index_directory` and `settings.agent.index.name` (or the equivalent CLI flags) to point to your pre-built index ([source](https://github.com/Future-House/paper-qa/issues/891)).
- If the index directory exists and contains valid index files, and `--agent.rebuild_index false` is set, pqa will use the existing index and not re-index the papers. If the directory is empty or mismatched, it will not find the index and will fail ([source](https://github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/agents/search.py#L201-L752)).

Common pitfalls: using a different path (relative vs. absolute), changing any relevant settings, or not pointing to the correct index directory will cause pqa to create a new (empty) index and fail to find your existing one. Double-check your configuration to ensure everything matches exactly.


<!-- Dosu Comment Footer -->
*To reply, just mention [@dosu](https://go.dosu.dev/dosubot).*

---
<sup>How did I do? [Good](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=great_response) | [Irrelevant](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=irrelevant_answer) | [Incorrect](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=incorrect_sources) | [Verbose](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=too_verbose) | [Hallucination](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=hallucination) | [Report 🐛](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=bug_report) | [Other](https://app.dosu.dev/response-feedback/8fb822db-f88a-4c47-9c89-092088814a20?feedback_type=other)</sup>

[![Chat with Dosu](https://dosu.dev/dosu-chat-badge.svg)](https://app.dosu.dev/0e493df4-ff8c-42a6-a866-71a34b293513/ask?utm_source=github)&nbsp;[![Open in Cursor](https://dosu.dev/dosu-in-cursor.svg)](https://cursor.com/link/prompt?text=The%20reason%20pqa%20keeps%20creating%20new%20index%20directories%20and%20fails%20to%20reuse%20your%20existing%20index%20is%20that%20the%20index%20directory%20name%20is%20generated%20from%20the%20absolute%20path%20of%20your%20paper%20directory%20and%20key%20settings%20like%20embedding%20model%2C%20chunk%20size%2C%20and%20chunking%20algorithm.%20If%20any%20of%20these%20change%E2%80%94even%20using%20a%20relative%20path%20vs.%20an%20absolute%20path%E2%80%94a%20new%20index%20directory%20%28with%20a%20new%20hash%29%20is%20created%2C%20and%20your%20previous%20index%20is%20ignored.%20When%20you%20set%20%60--agent.rebuild_index%20false%60%2C%20pqa%20will%20only%20use%20an%20existing%20index%20if%20the%20computed%20directory%20already%20exists%20and%20is%20populated%3B%20otherwise%2C%20it%20raises%20the%20%22Index%20...%20was%20empty%2C%20please%20rebuild%20it%22%20error%20and%20does%20not%20attempt%20to%20reuse%20any%20other%20index%C2%A0%28%5Bsource%5D%28https%3A//github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/settings.py%23L397-L820%29%2C%20%5Bsource%5D%28https%3A//github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/agents/search.py%23L201-L752%29%29.%0A%0ATo%20make%20pqa%20use%20your%20existing%20index%20and%20avoid%20re-indexing%3A%0A%0A-%20Make%20sure%20the%20paper%20directory%20path%20and%20all%20relevant%20settings%20%28embedding%20model%2C%20chunk%20size%2C%20overlap%2C%20chunking%20algorithm%2C%20etc.%29%20are%20exactly%20the%20same%20as%20when%20you%20built%20the%20index.%20Prefer%20using%20absolute%20paths.%0A-%20You%20can%20explicitly%20set%20the%20index%20directory%20and%20index%20name%20via%20%60settings.agent.index.index_directory%60%20and%20%60settings.agent.index.name%60%20%28or%20the%20equivalent%20CLI%20flags%29%20to%20point%20to%20your%20pre-built%20index%C2%A0%28%5Bsource%5D%28https%3A//github.com/Future-House/paper-qa/issues/891%29%29.%0A-%20If%20the%20index%20directory%20exists%20and%20contains%20valid%20index%20files%2C%20and%20%60--agent.rebuild_index%20false%60%20is%20set%2C%20pqa%20will%20use%20the%20existing%20index%20and%20not%20re-index%20the%20papers.%20If%20the%20directory%20is%20empty%20or%20mismatched%2C%20it%20will%20not%20find%20the%20index%20and%20will%20fail%C2%A0%28%5Bsource%5D%28https%3A//github.com/Future-House/paper-qa/blob/8221e3cf8b7ff7b2485cd9e05e44387dab183a0a/paperqa/agents/search.py%23L201-L752%29%29.%0A%0ACommon%20pitfalls%3A%20using%20a%20different%20path%20%28relative%20vs.%20absolute%29%2C%20changing%20any%20relevant%20settings%2C%20or%20not%20pointing%20to%20the%20correct%20index%20directory%20will%20cause%20pqa%20to%20create%20a%20new%20%28empty%29%20index%20and%20fail%20to%20find%20your%20existing%20one.%20Double-check%20your%20configuration%20to%20ensure%20everything%20matches%20exactly.)&nbsp;[![Join Discord](https://img.shields.io/badge/join-5865F2?logo=discord&logoColor=white&label=)](https://go.dosu.dev/discord-bot)&nbsp;[![Share on X](https://img.shields.io/badge/X-share-black)](https://twitter.com/intent/tweet?text=%40dosu_ai%20helped%20me%20solve%20this%20issue!&url=https%3A//github.com/Future-House/paper-qa/issues/1257)

**@jamesbraza** (2026-01-02):

Ah shoot, I see that `parse_pdf` is getting its hex code interpreted, breaking our cache key across Python invocations. I will open a fix soon, thanks for the report @rosegarden-coder ! 🦾
