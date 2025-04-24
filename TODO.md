***Nice to have***
- Preprocess documents with an LLM to "clean" it for TTS.
- Non monotonic voice

***Todo***
- somehow verify that created chunks are correct
- send emails
- optimize the app to increase rendering and processing speeds
- Improve responsiveness on various screen sizes

**_Issues_**

- Finalizing... on regenerate
- sometimes the times do not match
- rely on one fast pdf extraction logic

***Minor nitpicks***
- eye icon on sign up page looks weird.. almost as if there are two eye icons on top of each other
- disable regenerate button when in progress

***Won't fix***
- Extract PDF text on client since there are Next server action body size limits
  - PDF file still stored in bucket storage along with processed audio file
- Long PDFs error out with: Error generating audio with Google TTS for audiobook