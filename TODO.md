***Nice to have***
- Preprocess documents with an LLM to "clean" it for TTS.
- Non monotonic voice

***Todo***
- somehow verify that created chunks are correct
- send emails
- Improve responsiveness on various screen sizes
- Preprocess documents with an LLM to "clean" it for TTS.

**_Issues_**
- slow, pruning paper from hardware took 3-4 mins but better

***Won't fix***
- Extract PDF text on client since there are Next server action body size limits
  - PDF file still stored in bucket storage along with processed audio file
- Long PDFs error out with: Error generating audio with Google TTS for audiobook


***Minor nitpicks***
- eye icon on sign up page looks weird almost as if there are two eye icons on top of each other
- disable regenerate button when in progress