# Page-reading skill excerpt: after

When asked to read a public page, use the configured String `web_access_fetch`
tool with `{ "url": "<requested public URL>", "format": "markdown" }`.
Use the returned readable content as context, summarize the requested facts and
cite the page URL. Preserve dates and qualifications. Check that the response
contains the required content; report blocks or failures rather than inventing facts.

Use this change only after the target-tokenizer comparison and task evaluation
show that its avoidable downstream cost exceeds the added retrieval fee.
Keep the previous fetch path available for rollback. If the caller needs original
HTML, embedded scripts or binary bytes, preserve that contract separately.
