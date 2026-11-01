# JSON decode error when adding docs

_Opened by @Snikch63200_

Hello,

I've got this error when I try to add document with 'add' method from Doc() object : 

```
Failed to parse all of title, DOI, and authors from the ParsingSettings.structured_citation_prompt's response  {
"title": "La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux",
"authors": ["Auby, Bénédicte"],
"doi": null
}

Explication :

Le titre de l'ouvrage est "La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux".

Les auteurs de l'ouvrage sont Bénédicte Auby. Comme il y a un seul auteur, je l'ai renvoyé sous la forme d'une liste à une entrée.

Le DOI (Digital Object Identifier) n'était pas spécifié dans la citation MLA, donc je l'ai renvoyé comme null.</s>, consider using a manifest file or specifying a different citation prompt.
Traceback (most recent call last):
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\site-packages\paperqa\docs.py", line 321, in aadd
    citation_json = json.loads(clean_text)
                    ^^^^^^^^^^^^^^^^^^^^^^
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\json\__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\json\decoder.py", line 340, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 7 column 1 (char 158)
```

Is the JSON error is a consequence of lack of DOI in text ?
