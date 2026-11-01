# enrichment image format not accepted

_Opened by @satra_

for several, but not all pdfs that i am indexing, i get the following error

> Skipping enrichment for media index 0 on page 1 with metadata {'type': 'picture', 'width': 517, 'height': 108, 'info_hashable': '{"height": 108, "type": "picture", "width": 517}', 'page_num': 1} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp'].. Received Model Group=gpt-4o-2024-11-20

is there a way to address this issue?

---

## Discussion

**@jamesbraza** (2026-01-22):

Huh I haven't seen this. Are you able to share a PDF DOI or title, or the PDF itself that leads to this error?

Any chance you can share a minimal reproducer?

**@satra** (2026-01-23):

@jamesbraza - this is an example pdf with that warning: https://doi.org/10.1093/sleep/zsae048 (the pdf should be downloadable at the link). i'm also getting litellm timeouts when processing this, but that may be an unrelated issue.

**@jamesbraza** (2026-01-23):

Hi @satra, with `paper-qa[pypdf]==2026.01.05`, the below code works for me, including enrichment:

```python
from paperqa import Docs, Settings

docs = Docs()
settings = Settings(
    parsing={"parse_pdf": "paperqa_pypdf.parse_pdf_to_pages", "multimodal": True}
)
docname = await docs.aadd(
    "zsae048.pdf",
    title=(
        "Data-driven, generalizable prediction of adolescent sleep disturbances"
        " in the multisite Adolescent Brain Cognitive Development Study"
    ),
    doi="10.1093/sleep/zsae048",
    settings=settings,
)
(details,) = (d for d in docs.docs.values() if d.docname == docname)
texts = [t for t in docs.texts if t.doc == details]
media = [m for t in texts for m in t.media]
```

Can you give me a Python script that repros your issue?

**@satra** (2026-01-23):

@jamesbraza - here is the code: https://github.com/sensein/paperqa-test/blob/main/index_pdfs.py

i'm doing it on a locally downloaded pdf (i have both openai and semantic scholar keys set).

<details> <summary> script output </summary>

```
❯ python ../../paperqa-test/index_pdfs.py --paper-dir pubs
2026-01-23 10:32:10,210 - INFO - Found 1 PDF files in /Users/satra/software/repronim/abcd-repronim/work/temp/pubs
/Users/satra/software/mambaforge/envs/paperqa/lib/python3.13/site-packages/pydantic/main.py:250: UserWarning: When dealing with OpenAI gpt-5 models, the temperature must be set to 1, so the specified temperature 0.0 has been overridden to 1.
  validated_self = self.__pydantic_validator__.validate_python(data, self_instance=self)
2026-01-23 10:32:10,252 - INFO - Building index 'abcd_pubs_index'...
2026-01-23 10:32:10,252 - INFO - Using LLM model: gpt-5-mini
2026-01-23 10:32:10,252 - INFO - Rate limit: 10000 per minute
2026-01-23 10:32:10,252 - INFO - Concurrency: 5 files
2026-01-23 10:32:10,252 - INFO - Index will be stored in: pqa_index
2026-01-23 10:32:10,252 - INFO - Error log: pqa_index/processing_errors.txt
2026-01-23 10:32:10,252 - INFO - Progress file: pqa_index/indexing_progress.json
2026-01-23 10:32:10,252 - INFO - Processing [1/1]: McCurry-2024-10.1093_sleep_zsae048.pdf
2026-01-23 10:32:10,326 - INFO - Using in-memory rate limiter.
2026-01-23 10:32:39,467 - WARNING - CROSSREF_MAILTO environment variable not set. Crossref API rate limits may apply.
2026-01-23 10:32:39,468 - WARNING - CROSSREF_API_KEY environment variable not set. Crossref API rate limits may apply.
2026-01-23 10:34:47,424 - WARNING - Skipping enrichment for media index 0 on page 1 with metadata {'type': 'picture', 'width': 1477, 'height': 563, 'info_hashable': '{"height": 563, "type": "picture", "width": 1477}', 'page_num': 1} because it was rejected by the LLM provider for 'gpt-5-mini'. Full error message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp'].. Received Model Group=gpt-5-mini
Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3
2026-01-23 10:37:11,233 - ERROR -   ERROR [McCurry-2024-10.1093_sleep_zsae048.pdf]: litellm.Timeout: APITimeoutError - Request timed out. Error_str: Request timed out. - timeout value=60.0, time taken=60.79 seconds

Deployment Info: request_timeout: None
timeout: None. Received Model Group=gpt-5-mini
Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3
2026-01-23 10:37:11,234 - INFO - Error log written to: pqa_index/processing_errors.txt
2026-01-23 10:37:11,234 - INFO - Processing complete: 0 indexed, 1 failed
2026-01-23 10:37:11,234 - WARNING - No documents were successfully processed.
2026-01-23 10:37:11,236 - INFO - ==================================================
2026-01-23 10:37:11,236 - INFO - Final Summary:
2026-01-23 10:37:11,236 - INFO -   Successfully indexed: 0
2026-01-23 10:37:11,236 - INFO -   Failed: 1
2026-01-23 10:37:11,236 - INFO -   See error log at: pqa_index/processing_errors.txt
2026-01-23 10:37:11,236 - INFO - Progress saved to: pqa_index/indexing_progress.json
2026-01-23 10:37:11,236 - INFO - To reindex all files, use --no-resume flag.
2026-01-23 10:37:11,236 - INFO - To retry failed files, use --reprocess-failed flag.
```
</details>

the relevant settings are here: https://github.com/sensein/paperqa-test/blob/41d65d6c76df3339b43b53f34d6481a70c003001/index_pdfs.py#L48

overall i'm trying to iterate separately through pdfs accumulating failed ones into an index, and then query it separately. (i have a separate issue that the index appears to only contain 8 papers when i processed 1200 through this iterative process - i'll continue to debug that).

**@satra** (2026-01-24):

instead of my script i tried this:

❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" index pubs

when i run the above, i see the same original warning.

<details> <summary> indexing output </summary>

```
[10:53:51] New file to index: McCurry-2024-10.1093_sleep_zsae048.pdf...                                  
[10:53:54] CROSSREF_MAILTO environment variable not set. Crossref API rate limits may apply.             
           CROSSREF_API_KEY environment variable not set. Crossref API rate limits may apply.            
[10:54:34] Skipping enrichment for media index 0 on page 1 with metadata {'type': 'picture', 'width':    
           1477, 'height': 563, 'info_hashable': '{"height": 563, "type": "picture", "width": 1477}',    
           'page_num': 1} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error
           message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please 
           make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp']..       
           Received Model Group=gpt-4o-2024-11-20                                                        
           Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3         
[10:55:38] Skipping enrichment for media index 0 on page 2 with metadata {'type': 'picture', 'width':    
           3152, 'height': 1827, 'info_hashable': '{"height": 1827, "type": "picture", "width": 3152}',  
           'page_num': 2} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error
           message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please 
           make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp']..       
           Received Model Group=gpt-4o-2024-11-20                                                        
           Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3         
[10:56:11] Skipping enrichment for media index 0 on page 5 with metadata {'type': 'picture', 'width':    
           3964, 'height': 1969, 'info_hashable': '{"height": 1969, "type": "picture", "width": 3964}',  
           'page_num': 5} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error
           message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please 
           make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp']..       
           Received Model Group=gpt-4o-2024-11-20                                                        
           Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3         
[10:57:21] Skipping enrichment for media index 0 on page 6 with metadata {'type': 'picture', 'width':    
           4005, 'height': 3009, 'info_hashable': '{"height": 3009, "type": "picture", "width": 4005}',  
           'page_num': 6} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error
           message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please 
           make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp']..       
           Received Model Group=gpt-4o-2024-11-20                                                        
           Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3         
[10:57:31] Skipping enrichment for media index 0 on page 7 with metadata {'type': 'picture', 'width':    
           4005, 'height': 3009, 'info_hashable': '{"height": 3009, "type": "picture", "width": 4005}',  
           'page_num': 7} because it was rejected by the LLM provider for 'gpt-4o-2024-11-20'. Full error
           message: litellm.BadRequestError: OpenAIException - You uploaded an unsupported image. Please 
           make sure your image has of one the following formats: ['png', 'jpeg', 'gif', 'webp']..       
           Received Model Group=gpt-4o-2024-11-20                                                        
           Available Model Group Fallbacks=None LiteLLM Retried: 3 times, LiteLLM Max Retries: 3         
[10:57:34] Complete (Data-driven, generalizable prediction of adolescent sleep disturbances in the       
           multisite Adolescent Brain Cognitive Development Study). 
```

</details>


also, sometimes it will timeout, and skip index, and running again does not reprocess it. i have to delete the index and start again. this is why i started writing my own script (there seemed no obvious way to recover from timeout or other errors).

**@jamesbraza** (2026-01-24):

Hi @satra okay I figured it out. Can you run `pip list | grep -e pypdf -e pdfplumber -e pymupdf` for me?

I think the issue is that:

1. You're using PyPDF reader (`paper-qa-pypdf`)
2. You don't have `pdfplumber` installed, which means `MediaMode.INDIVIDUAL` is being used
3. Apparently in this individual media mode, the image read is not PNG it's something else (possibly JPEG 2000)
4. We are telling OpenAI the image is PNG, but it's some other type, and the model times out

I will fix this. To work around this in the meantime, either:

- Install `pymupdf` via `pip install paper-qa[pymupdf]`. This will circumvent this error by using our PyMuPDF reader.
- Install `pdfplumber` via `pip install paper-qa[pypdf-enhanced]`. This will circumvent this error by using a more featureful PyPDF reader

**@satra** (2026-01-24):

thanks @jamesbraza.

indeed no pdfplumber.

```
pip list | grep -e pypdf -e pdfplumber -e pymupdf
paper-qa-pypdf            2026.1.5
pypdf                     6.6.0
```

after those install steps, no warnings at all. 

```
❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" index pubs
[18:19:37] New file to index: McCurry-2024-10.1093_sleep_zsae048.pdf...                                  
[18:19:42] CROSSREF_MAILTO environment variable not set. Crossref API rate limits may apply.             
           CROSSREF_API_KEY environment variable not set. Crossref API rate limits may apply.            
[18:19:53] Complete (Data-driven, generalizable prediction of adolescent sleep disturbances in the       
           multisite Adolescent Brain Cognitive Development Study).                                      

❯ pqa --agent.index.name abcd_pubs --agent.index.index_directory abcd-index --parsing.parse_pdf "paperqa_pypdf.parse_pdf_to_pages" search test
[18:25:07] No results found. Searched 0 docs. 
```

a little surprised that search says 0 docs. i'll close this and will open others as needed if i can't figure out how to use the index.

**@jamesbraza** (2026-01-24):

Thanks for sharing. Let's keep this open until I fix this bug with `pdfplumber`

**@jamesbraza** (2026-01-24):

You may want to try deleting the index `abcd_pubs` in `~/.pqa/indexes` and running again, per the 0 docs. I am not sure without more info

**@satra** (2026-01-25):

re index and 0 docs, followed up in #1274
