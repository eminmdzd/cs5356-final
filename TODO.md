***Todo***

- Cloud storage
- Extract PDF text on client since there are Next server action body size limits
  - PDF file still stored in bucket storage along with processed audio file
- send emails
- optimize the app to increase rendering and processing speeds
- Preprocess documents with an LLM to "clean" it for TTS.
- Improve responsiveness

**_Minor nitpicking_**

- navbar should become invisible after logout
- add hover states to buttons


**_Issues_**

- Long PDFs error out with: Error generating audio with Google TTS for audiobook
- Duration seems to be incorrect
  - I believe we start by estimating the duration, but this should be updated
- Processing status doesn't update without refresh, probably just missing revalidate somewhere
- Multiple notifications