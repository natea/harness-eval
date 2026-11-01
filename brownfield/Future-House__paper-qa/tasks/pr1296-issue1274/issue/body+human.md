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

**@jamesbraza** (2026-01-25):

Thanks for this report. Much appreciated

**@satra** (2026-01-25):

i'll also add that the name of the index (provided in the command line) is not being used to create the directory (an automatic name is generated).
