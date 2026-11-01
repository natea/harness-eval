# name of index insufficient to search index

_Opened by @satra_

i'm creating an index (just for testing) with 1 pdf. it's named `abcd_pubs` and stored in a directory `abcd-index`. however, it's creating a new index directory  in the `index_directory` if i do `index` followed by `search`.

```shell
❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" index pubs
[19:46:36] New file to index: McCurry-2024-10.1093_sleep_zsae048.pdf...                                  
[19:46:39] CROSSREF_MAILTO environment variable not set. Crossref API rate limits may apply.             
           CROSSREF_API_KEY environment variable not set. Crossref API rate limits may apply.            
[19:46:52] Complete (Data-driven, generalizable prediction of adolescent sleep disturbances in the       
           multisite Adolescent Brain Cognitive Development Study).                                      
❯ ls -a abcd-index
.						pqa_index_d529210c120129a20a75fb4551bddd03
..
❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" search test
[19:47:21] No results found. Searched 0 docs.                                                            
❯ ls -a abcd-index
.						pqa_index_d529210c120129a20a75fb4551bddd03
..						pqa_index_e38e596c7df8489e3c188fbe128696cf
```

however, if i provide the pubs directory it appears to do the correct thing:
```shell
❯ rm -rf abcd-index
❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" --agent.index.paper_directory pubs index pubs
[19:49:22] New file to index: McCurry-2024-10.1093_sleep_zsae048.pdf...                                  
[19:49:24] CROSSREF_MAILTO environment variable not set. Crossref API rate limits may apply.             
           CROSSREF_API_KEY environment variable not set. Crossref API rate limits may apply.            
[19:49:38] Complete (Data-driven, generalizable prediction of adolescent sleep disturbances in the       
           multisite Adolescent Brain Cognitive Development Study).                                      
❯ ls -a abcd-index
.						pqa_index_d529210c120129a20a75fb4551bddd03
..
❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" --agent.index.paper_directory pubs search test
                                               PDF Search                                                
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Title                                                        ┃ File                                   ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│ Data-driven, generalizable prediction of adolescent sleep    │ McCurry-2024-10.1093_sleep_zsae048.pdf │
│ disturbances in the multisite Adolescent Brain Cognitive     │                                        │
│ Development Study                                            │                                        │
└──────────────────────────────────────────────────────────────┴────────────────────────────────────────┘
❯ ls -a abcd-index
.						pqa_index_d529210c120129a20a75fb4551bddd03
..
```

---

## Discussion

**@dosubot** (bot) (2026-01-25):

<!-- Answer -->
The index name alone isn’t enough for pqa to find and reuse an existing index—pqa also uses the paper directory (and other settings) to compute the actual index location. If you don’t specify `--agent.index.paper_directory` during both indexing and searching, pqa defaults to the current working directory, which changes the computed index directory name. That’s why you see a new index directory created and “0 docs” found: pqa is looking in a different place than where your original index was built.

To reliably reuse your index and avoid creating new ones, always specify `--agent.index.paper_directory` (ideally as an absolute path) during both indexing and searching. This ensures pqa computes the same index directory and finds your documents as expected. See [this explanation in the code and issues](https://github.com/Future-House/paper-qa/issues/1257) for more details.


<!-- Dosu Comment Footer -->
*To reply, just mention [@dosu](https://go.dosu.dev/dosubot).*

---
<sup>How did I do? [Good](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=great_response) | [Irrelevant](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=irrelevant_answer) | [Incorrect](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=incorrect_sources) | [Verbose](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=too_verbose) | [Hallucination](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=hallucination) | [Report 🐛](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=bug_report) | [Other](https://app.dosu.dev/response-feedback/02f9eb89-a92d-46ee-a7c0-15130b5de1be?feedback_type=other)</sup>

[![Chat with Dosu](https://dosu.dev/dosu-chat-badge.svg)](https://app.dosu.dev/0e493df4-ff8c-42a6-a866-71a34b293513/ask?utm_source=github)&nbsp;[![Open in Cursor](https://dosu.dev/dosu-in-cursor.svg)](https://cursor.com/link/prompt?text=The%20index%20name%20alone%20isn%E2%80%99t%20enough%20for%20pqa%20to%20find%20and%20reuse%20an%20existing%20index%E2%80%94pqa%20also%20uses%20the%20paper%20directory%20%28and%20other%20settings%29%20to%20compute%20the%20actual%20index%20location.%20If%20you%20don%E2%80%99t%20specify%20%60--agent.index.paper_directory%60%20during%20both%20indexing%20and%20searching%2C%20pqa%20defaults%20to%20the%20current%20working%20directory%2C%20which%20changes%20the%20computed%20index%20directory%20name.%20That%E2%80%99s%20why%20you%20see%20a%20new%20index%20directory%20created%20and%20%E2%80%9C0%20docs%E2%80%9D%20found%3A%20pqa%20is%20looking%20in%20a%20different%20place%20than%20where%20your%20original%20index%20was%20built.%0A%0ATo%20reliably%20reuse%20your%20index%20and%20avoid%20creating%20new%20ones%2C%20always%20specify%20%60--agent.index.paper_directory%60%20%28ideally%20as%20an%20absolute%20path%29%20during%20both%20indexing%20and%20searching.%20This%20ensures%20pqa%20computes%20the%20same%20index%20directory%20and%20finds%20your%20documents%20as%20expected.%20See%20%5Bthis%20explanation%20in%20the%20code%20and%20issues%5D%28https%3A//github.com/Future-House/paper-qa/issues/1257%29%20for%20more%20details.)&nbsp;[![Join Discord](https://img.shields.io/badge/join-5865F2?logo=discord&logoColor=white&label=)](https://go.dosu.dev/discord-bot)&nbsp;[![Share on X](https://img.shields.io/badge/X-share-black)](https://twitter.com/intent/tweet?text=%40dosu_ai%20helped%20me%20solve%20this%20issue!&url=https%3A//github.com/Future-House/paper-qa/issues/1274)

**@jamesbraza** (2026-01-25):

Thanks for this report. Much appreciated

**@satra** (2026-01-25):

i'll also add that the name of the index (provided in the command line) is not being used to create the directory (an automatic name is generated).
