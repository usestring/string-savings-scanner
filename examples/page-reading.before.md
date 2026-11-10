# Page-reading skill excerpt: before

When asked to read a public page, fetch its HTML with the available HTTP client
or `curl --fail --silent --show-error "$url"`. Place the returned HTML into the
reading context, then summarize the requested facts and cite the page URL.
Preserve dates and qualifications. Report HTTP failures rather than inventing content.
