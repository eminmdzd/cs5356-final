***Nice to have***
- Preprocess documents with an LLM to "clean" it for TTS.
- Non monotonic voice

***Todo***
- somehow verify that created chunks are correct
- send emails
- optimize the app to increase rendering and processing speeds
- Improve responsiveness on various screen sizes
- Preprocess documents with an LLM to "clean" it for TTS.

**_Issues_**

- Long PDFs error out with: Error generating audio with Google TTS for audiobook
- Finalizing... on regenerate
- sometimes the times do not match
- rely on one fast pdf extraction logic


***Won't fix***
- Extract PDF text on client since there are Next server action body size limits
  - PDF file still stored in bucket storage along with processed audio file
- Long PDFs error out with: Error generating audio with Google TTS for audiobook
- bug where status changes after completion of generation
- sometimes the times do not match
- created ones fail if others fail



***Minor nitpicks***
- the update title pencil is gone and not quite clear ui on how to do it
- eye icon on sign up page looks weird.. almost as if there are two eye icons on top of each other
- when generating audio there are 2 values for percentage of completion
- disable regenerate button when in progress