# maybe_is_text() discards valid text due to spaces from titles and tables

_Opened by @loesinghaus_

I noticed that the maybe_is_text() check discards quite a few perfectly valid and well-parsed publications. The issue is that it checks the entropy of the first text chunk of a document. Document parsing by pymupdf can introduce a lot of spaces, especially if the first few pages contain a title page, tables, or something similar (which they very often do, especially for books). Might be better to average across text chunks in the middle of the document.

Alternatively, checking the entropy of the text without spaces fixed it for my pdfs:

```
def maybe_is_text(s: str, thresh: float = 2.5) -> bool:
    if not s:
        return False
    # Calculate the entropy of the string
    entropy = 0.0
    s_wo_spaces = s.replace(" ", "")
    for c in string.printable:
        p = s_wo_spaces.count(c) / len(s_wo_spaces)
        if p > 0:
            entropy += -p * math.log2(p)

    return entropy > thresh
```
