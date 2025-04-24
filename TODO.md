***Todo***

- Cloud storage
- Extract PDF text on client since there are Next server action body size limits
  - PDF file still stored in bucket storage along with processed audio file
- send emails
- optimize the app to increase rendering and processing speeds
- Preprocess documents with an LLM to "clean" it for TTS.

**_Issues_**

- Long PDFs error out with: Error generating audio with Google TTS for audiobook
- Finalizing... on regenerate
- switch to short polling
- bug where status changes after completion of generation
- sometimes the times do not match


***Minor nitpicks***
- the update title pencil is gone and not quite clear ui on how to do it
- eye icon on sign up page looks weird.. almost as if there are two eye icons on top of each other
- when generating audio there are 2 values for percentage of completion