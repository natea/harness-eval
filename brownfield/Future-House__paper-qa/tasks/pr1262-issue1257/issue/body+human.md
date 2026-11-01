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

**@jamesbraza** (2026-01-02):

Ah shoot, I see that `parse_pdf` is getting its hex code interpreted, breaking our cache key across Python invocations. I will open a fix soon, thanks for the report @rosegarden-coder ! 🦾
