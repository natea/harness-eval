# CMYK images in PDFs crash indexing with OSError

_Opened by @menyoung_

## Bug

When indexing a directory containing PDFs that have CMYK images, `pqa index` crashes instead of skipping the problematic files.

## Error

```
OSError: cannot write mode CMYK as PNG
```

The crash originates in `paperqa_pypdf/reader.py:323`:

```python
pil_image.save(buf, format="PNG")
```

Pillow cannot save CMYK-mode images as PNG. The error propagates out of the `anyio.TaskGroup` in `get_directory_index` and kills the entire indexing process.

## Steps to reproduce

1. Have a directory of PDFs where at least one contains a CMYK image (common in academic papers from print journals)
2. Run `pqa index /path/to/pdfs`
3. Indexing crashes with an `ExceptionGroup` containing the `OSError`

## Expected behavior

The file-level error handler in `process_file` (search.py:521) should catch this and skip the file, logging a warning. Currently it does log "Error parsing ... skipping index for this file" but the exception still propagates and crashes the TaskGroup.

## Workaround

Set `parsing.multimodal` to `"OFF"` in Settings to disable image extraction entirely.

## Full traceback

```
ExceptionGroup: unhandled errors in a TaskGroup (2 sub-exceptions)
+-+---------------- 1 ----------------
  | Traceback (most recent call last):
  |   File ".../PIL/PngImagePlugin.py", line 1380, in _save
  |     rawmode, bit_depth, color_type = _OUTMODES[outmode]
  | KeyError: 'CMYK'
  |
  | The above exception was the direct cause of the following exception:
  |
  | Traceback (most recent call last):
  |   File ".../paperqa/agents/search.py", line 522, in process_file
  |     await tmp_docs.aadd(
  |   File ".../paperqa/docs.py", line 303, in aadd
  |     texts, metadata = await read_doc(
  |   File ".../paperqa/readers.py", line 464, in read_doc
  |     parsed_text = cast(SyncPDFParserFn, parse_pdf)(path, **parser_kwargs)
  |   File ".../paperqa_pypdf/reader.py", line 323, in parse_pdf_to_pages
  |     pil_image.save(buf, format="PNG")
  |   File ".../PIL/Image.py", line 2590, in save
  |     save_handler(self, fp, filename)
  |   File ".../PIL/PngImagePlugin.py", line 1383, in _save
  |     raise OSError(msg) from e
  | OSError: cannot write mode CMYK as PNG
```

## Suggested fix

In `paperqa_pypdf/reader.py`, convert CMYK images to RGB before saving as PNG:

```python
if pil_image.mode == "CMYK":
    pil_image = pil_image.convert("RGB")
pil_image.save(buf, format="PNG")
```

## Environment

- paper-qa 1.26.0
- pillow (latest)
- macOS
