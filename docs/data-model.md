# Meeting Data Model

The Electron app persists all durable meeting information locally. A meeting should contain an ID,
title, timestamps, participants, processing state, and an ordered transcript.

Each transcript turn should contain a stable ID, speaker ID or label, start and end times, text,
language, and optional confidence/provenance metadata. Turns are the source of truth. Paragraphs,
bullet notes, summaries, action items, and exports are derived from turns and must remain
regenerable.

Remote job IDs are temporary correlation values, not durable ownership keys. The server does not
own meeting records.
