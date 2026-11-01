# Dockey confilct because of same Doi

_Opened by @lucky0218_

In the default settings, if two papers have the same Doi and the user doesn't set the doc_id, they'll have the same dockey, leading to one paper unable to be found.

`
elif "doc_id" not in data or not data["doc_id"]:  # keep user defined doc_ids
      data["doc_id"] = encode_id(uuid4())
        if "dockey" in data.get(
            "fields_to_overwrite_from_metadata",
            DEFAULT_FIELDS_TO_OVERWRITE_FROM_METADATA,
        ) and ("dockey" not in data or not data["dockey"]):
            data["dockey"] = data["doc_id"]
`

It may happen on the circumstance of two papers having the same Doi (e.g. one paper is normal thesis, the other one is its supplement information, like those published on ACS)

---

## Discussion

**@jamesbraza** (2025-07-14):

Thanks for the report. From my understanding of DOIs, there is an assumption of uniqueness.

Can you point out where one DOIs corresponds with two separate PDF papers?

**@jamesbraza** (2025-07-14):

> Can you point out where one DOIs corresponds with two separate PDF papers?

> > It may happen on the circumstance of two papers having the same Doi (e.g. one paper is normal thesis, the other one is its supplement information, like those published on ACS)

Nevermind to this, I should have read the full issue. I will get back to you on this shortly.

**@jamesbraza** (2025-07-14):

Hi @lucky0218 I guess what we can do is have the `doc_id` be a composite of fields from `paperqa.DocDetails`.

Do you mind sharing the `DocDetails` you get for the main text and the supp?  Mainly, I want to diff the two `paperqa.DocDetails` and see what fields we can use to make a composite key.

For example, does the `title` change between the two?

**@lucky0218** (2025-07-15):

Of course not!

`{'fb08e04d658a5521': DocDetails(docname='lu2022enzymaticdnasynthesis', dockey='fb08e04d658a5521', citation='Xiaoyun Lu, Jinlong Li, Congyu Li, Qianqian Lou, Kai Peng, Bijun Cai, Ying Liu, Yonghong Yao, Lina Lu, Zhenyang Tian, Hongwu Ma, Wen Wang, Jian Cheng, Xiaoxian Guo, Huifeng Jiang, and Yanhe Ma. Enzymatic dna synthesis by engineering terminal deoxynucleotidyl transferase. ACS Catalysis, 2022. URL: https://doi.org/10.1021/acscatal.1c04879, doi:10.1021/acscatal.1c04879.', fields_to_overwrite_from_metadata={'doc_id', 'docname', 'dockey', 'citation', 'key'}, key='lu2022enzymaticdnasynthesis', bibtex='@article{lu2022enzymaticdnasynthesis,\n    author = "Lu, Xiaoyun and Li, Jinlong and Li, Congyu and Lou, Qianqian and Peng, Kai and Cai, Bijun and Liu, Ying and Yao, Yonghong and Lu, Lina and Tian, Zhenyang and Ma, Hongwu and Wang, Wen and Cheng, Jian and Guo, Xiaoxian and Jiang, Huifeng and Ma, Yanhe",\n    title = "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase",\n    year = "2022",\n    journal = "ACS Catalysis",\n    doi = "10.1021/acscatal.1c04879",\n    url = "https://doi.org/10.1021/acscatal.1c04879"\n}\n', authors=['Xiaoyun Lu', 'Jinlong Li', 'Congyu Li', 'Qianqian Lou', 'Kai Peng', 'Bijun Cai', 'Ying Liu', 'Yonghong Yao', 'Lina Lu', 'Zhenyang Tian', 'Hongwu Ma', 'Wen Wang', 'Jian Cheng', 'Xiaoxian Guo', 'Huifeng Jiang', 'Yanhe Ma'], publication_date=None, year=2022, volume=None, issue=None, issn=None, pages=None, journal='ACS Catalysis', publisher=None, url=None, title='Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', citation_count=None, bibtex_type='article', source_quality=3, is_retracted=None, doi='10.1021/acscatal.1c04879', doi_url='https://doi.org/10.1021/acscatal.1c04879', doc_id='fb08e04d658a5521', file_location=None, license=None, pdf_url=None, other={'bibtex_source': ['self_generated'], 'paperId': '404bfea1c49cda1f55cf502a8b867b4c278132e3', 'externalIds': {'DOI': '10.1021/acscatal.1c04879', 'CorpusId': 246981124}, 'matchScore': 230.77332, 'client_source': ['semantic_scholar']}, formatted_citation='Xiaoyun Lu, Jinlong Li, Congyu Li, Qianqian Lou, Kai Peng, Bijun Cai, Ying Liu, Yonghong Yao, Lina Lu, Zhenyang Tian, Hongwu Ma, Wen Wang, Jian Cheng, Xiaoxian Guo, Huifeng Jiang, and Yanhe Ma. Enzymatic dna synthesis by engineering terminal deoxynucleotidyl transferase. ACS Catalysis, 2022. URL: https://doi.org/10.1021/acscatal.1c04879, doi:10.1021/acscatal.1c04879.')}`

The one above is main text, below is supp.

`{'fb08e04d658a5521': DocDetails(docname='lu2022enzymaticdnasynthesis', dockey='fb08e04d658a5521', citation='Xiaoyun Lu, Jinlong Li, Congyu Li, Qianqian Lou, Kai Peng, Bijun Cai, Ying Liu, Yonghong Yao, Lina Lu, Zhenyang Tian, Hongwu Ma, Wen Wang, Jian Cheng, Xiaoxian Guo, Huifeng Jiang, and Yanhe Ma. Enzymatic dna synthesis by engineering terminal deoxynucleotidyl transferase. ACS Catalysis, 2022. URL: https://doi.org/10.1021/acscatal.1c04879, doi:10.1021/acscatal.1c04879.', fields_to_overwrite_from_metadata={'doc_id', 'dockey', 'citation', 'key', 'docname'}, key='lu2022enzymaticdnasynthesis', bibtex='@article{lu2022enzymaticdnasynthesis,\n    author = "Lu, Xiaoyun and Li, Jinlong and Li, Congyu and Lou, Qianqian and Peng, Kai and Cai, Bijun and Liu, Ying and Yao, Yonghong and Lu, Lina and Tian, Zhenyang and Ma, Hongwu and Wang, Wen and Cheng, Jian and Guo, Xiaoxian and Jiang, Huifeng and Ma, Yanhe",\n    title = "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase",\n    year = "2022",\n    journal = "ACS Catalysis",\n    doi = "10.1021/acscatal.1c04879",\n    url = "https://doi.org/10.1021/acscatal.1c04879"\n}\n', authors=['Xiaoyun Lu', 'Jinlong Li', 'Congyu Li', 'Qianqian Lou', 'Kai Peng', 'Bijun Cai', 'Ying Liu', 'Yonghong Yao', 'Lina Lu', 'Zhenyang Tian', 'Hongwu Ma', 'Wen Wang', 'Jian Cheng', 'Xiaoxian Guo', 'Huifeng Jiang', 'Yanhe Ma'], publication_date=None, year=2022, volume=None, issue=None, issn=None, pages=None, journal='ACS Catalysis', publisher=None, url=None, title='Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', citation_count=None, bibtex_type='article', source_quality=3, is_retracted=None, doi='10.1021/acscatal.1c04879', doi_url='https://doi.org/10.1021/acscatal.1c04879', doc_id='fb08e04d658a5521', file_location=None, license=None, pdf_url=None, other={'bibtex_source': ['self_generated'], 'paperId': '404bfea1c49cda1f55cf502a8b867b4c278132e3', 'externalIds': {'DOI': '10.1021/acscatal.1c04879', 'CorpusId': 246981124}, 'matchScore': 235.32079, 'client_source': ['semantic_scholar']}, formatted_citation='Xiaoyun Lu, Jinlong Li, Congyu Li, Qianqian Lou, Kai Peng, Bijun Cai, Ying Liu, Yonghong Yao, Lina Lu, Zhenyang Tian, Hongwu Ma, Wen Wang, Jian Cheng, Xiaoxian Guo, Huifeng Jiang, and Yanhe Ma. Enzymatic dna synthesis by engineering terminal deoxynucleotidyl transferase. ACS Catalysis, 2022. URL: https://doi.org/10.1021/acscatal.1c04879, doi:10.1021/acscatal.1c04879.')}`

**@lucky0218** (2025-07-15):

I mitigate this issue modifying the code shown below:

```
class DOIOrTitleBasedProvider(MetadataProvider[DOIQuery | TitleAuthorQuery]):

    async def query(self, query: dict) -> DocDetails | None:
        return None  #  ADDED BY ME
        try:
            client_query = self.query_transformer(query)
            return await self._query(client_query)
```

which is nowhere near a good solution.

**@lucky0218** (2025-07-15):

After modifying the code, I got:

`{'a58d048426a69f2acd4712a297f2930f': DocDetails(docname='Lu2022', dockey='a58d048426a69f2acd4712a297f2930f', citation='Lu, Xiaoyun, et al. "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase." *ACS Catalysis*, vol. 12, 2022, pp. 2988-2997. pubs.acs.org/acscatalysis. Accessed 11 Mar. 2025.', fields_to_overwrite_from_metadata=set(), key='xiaoyunUnknownyearenzymaticdnasynthesis', bibtex='@article{xiaoyunUnknownyearenzymaticdnasynthesis,\n    author = "Lu, Xiaoyun",\n    title = "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase",\n    year = "Unknown year",\n    journal = "Unknown journal"\n}\n', authors=['Lu, Xiaoyun'], publication_date=None, year=None, volume=None, issue=None, issn=None, pages=None, journal=None, publisher=None, url=None, title='Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', citation_count=None, bibtex_type=None, source_quality=None, is_retracted=None, doi=None, doi_url=None, doc_id='6d7e19e4432b827a', file_location=None, license=None, pdf_url=None, other={}, formatted_citation='Lu, Xiaoyun, et al. "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase." *ACS Catalysis*, vol. 12, 2022, pp. 2988-2997. pubs.acs.org/acscatalysis. Accessed 11 Mar. 2025.')}`

The one above is main text, below is supp.

{'c02c89b1bd4e82afff267047f3cfcdbf': DocDetails(docname='Lu', dockey='c02c89b1bd4e82afff267047f3cfcdbf', citation='Lu, Xiaoyun, et al. *Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase*.', fields_to_overwrite_from_metadata=set(), key='xiaoyunUnknownyearenzymaticdnasynthesis', bibtex='@article{xiaoyunUnknownyearenzymaticdnasynthesis,\n    author = "Lu, Xiaoyun",\n    title = "Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase",\n    year = "Unknown year",\n    journal = "Unknown journal"\n}\n', authors=['Lu, Xiaoyun'], publication_date=None, year=None, volume=None, issue=None, issn=None, pages=None, journal=None, publisher=None, url=None, title='Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', citation_count=None, bibtex_type=None, source_quality=None, is_retracted=None, doi=None, doi_url=None, doc_id='cf0c0f492970c8d9', file_location=None, license=None, pdf_url=None, other={}, formatted_citation='Lu, Xiaoyun, et al. *Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase*.')}

The md5sum of their contents differ a lot.

**@lucky0218** (2025-07-15):

Link to the main text: [Main](https://pubs.acs.org/doi/pdf/10.1021/acscatal.1c04879)
Link to the supp text: [Supp](https://pubs.acs.org/doi/suppl/10.1021/acscatal.1c04879/suppl_file/cs1c04879_si_001.pdf)

**@jamesbraza** (2025-07-16):

> Of course not!
> 
> ...
> 
> The one above is main text, below is supp.
> 
> ...

Diffing these blobs, they're nearly identical: https://www.diffchecker.com/qt3xx3TU/

It seems like supplemental info should have some different fields (e.g. title, URL, or BibTeX). I guess taking into account a content hash if `file_location` is populated is a decent idea, but first I would like to just understand how you arrived to this situation.

To construct those `DocDetails`:

- What `query` dictionary are you passing to the `DOIOrTitleBasedProvider.query`?
- What metadata provider (e.g. Crossref, Semantic Scholar) is providing data on both the main text and the supplementary information?

Or, are you manually constructing your own `DocDetails` objects?

**@lucky0218** (2025-07-16):

Thanks for your timely response. 

As for metadata provider, it used default settings ( it's Semantic Scholar, crossRef get timed out). The settings are the same across main text and supplementary information.  I put the main text and supple info in the same directory.

**@lucky0218** (2025-07-16):

`Query is: {'authors': ['Lu, Xiaoyun'], 'title': 'Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', 'fields': ['title', 'author', 'journal', 'year', 'doi', 'authors'], 'session': <aiohttp.client.ClientSession object at 0x0000017FC1988C50>}`
`Query is: {'authors': ['Lu, Xiaoyun'], 'title': 'Enzymatic DNA Synthesis by Engineering Terminal Deoxynucleotidyl Transferase', 'fields': ['title', 'author', 'journal', 'year', 'doi', 'authors'], 'session': <aiohttp.client.ClientSession object at 0x0000020A586FF350>}`

First one is supple, second one is main text. Exactly same. Dont know how to get the fields printed here, but they should be very much the same as shown in my previous answers.

**@jamesbraza** (2025-07-24):

Hi @lucky0218 alright I have made a minimal reproducer of this with `paper-qa==5.25.0`:

```python
import asyncio
import json

from paperqa import Docs


async def main(common_doi: str = "10.1021/acscatal.1c04879") -> None:
    main_docs = Docs()
    common_docs = Docs()
    main_name = await common_docs.aadd(
        "lu-et-al-main.pdf", doi=common_doi
    )
    supp_name = await common_docs.aadd(
        "lu-et-al-supp.pdf", doi=common_doi
    )
```

I can indeed see the issue you're hitting. Yeah looks like we need to rely on a content hash, which we actually already have here: https://github.com/Future-House/paper-qa/blob/v5.25.0/paperqa/docs.py#L271
