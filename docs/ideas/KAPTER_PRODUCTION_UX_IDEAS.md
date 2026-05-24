# Kapter Production UX Ideas

> Product: **Kapter**  
> Scope: Long-term production UX reference for the bilingual subtitles mobile app  
> Created: 2026-05-20  
> Status: Product/UX direction notes, not an implementation ticket

## 1. Core Product Positioning

Kapter should not feel like a generic language-learning app.

The stronger positioning is:

> **Kapter is a bilingual subtitle workspace that helps users turn real media into watchable, learnable, exportable bilingual subtitles.**

The product can support language learning deeply, but the main flow should still center on media:

```text
Import media
  -> process subtitles
  -> watch with bilingual/karaoke timing
  -> tap words
  -> save vocabulary
  -> export/share results
```

This positioning matters because many users may use Kapter for:

- YouTube learning content
- Lectures and training videos
- Podcasts or interviews
- Movies, anime, drama, or short clips
- Creator subtitle generation
- Language learning from real-world media
- Personal media transcription and translation

So the product should avoid making the first impression feel like:

```text
Pick a language course
Study lessons
Do exercises
```

Instead, the first impression should be:

```text
Bring your own media.
Kapter makes it bilingual, timed, searchable, and learnable.
```

## 2. Production Design Principles

### 2.1 Media-first, learning-second

The media item is the main object in the app.

Vocabulary, dictionary, export, subscriptions, and settings should orbit around media processing and playback.

### 2.2 Bilingual-by-default

The default result should show both source and translated subtitles. Users can hide layers later, but the product promise is bilingual output.

### 2.3 Early playback is the key UX advantage

Kapter should let users open the player as soon as translated batches are available, without waiting for the final subtitle artifact.

This should become a visible product advantage:

```text
First subtitles are ready.
Open player now.
```

### 2.4 Do not expose internal AI knobs too early

Most users should not see model names, VAD settings, batch size, GPU routing, alignment strategy, or worker internals.

Production settings should expose user outcomes:

- Subtitle target language
- Subtitle layers
- Export format
- Playback behavior
- Vocabulary behavior
- Quota and plan

### 2.5 Quota should be understandable before processing

GPU processing is expensive. Users should know roughly how much quota a media job will consume before they submit it.

Good UX:

```text
This media is around 18 minutes.
You have 42 / 120 minutes left this month.
```

Bad UX:

```text
Start processing
...
Quota exceeded
```

### 2.6 Processing should build trust

AI jobs can be slow. The processing screen should explain what is happening without overwhelming the user.

Prefer:

```text
Uploading
Validating media
Transcribing speech
Translating subtitles
Aligning words
First subtitles ready
Finalizing
```

Avoid vague states like:

```text
Loading...
Running...
Please wait...
```

### 2.7 Settings should be boring, predictable, and production-grade

Settings should be organized by user mental model:

- Account
- App preferences
- Subtitle defaults
- Processing defaults
- Subscription and usage
- Storage and privacy
- Support/about

## 3. Language Model for the Product

Avoid using one ambiguous field like `mainLanguage`.

Use clearer language concepts:

```text
appLanguage
```

The language of the application UI. For v1, this can be English or Vietnamese.

```text
defaultTargetLanguage
```

The default language that subtitles are translated into.

```text
learningLanguages
```

Languages the user is interested in watching, studying, or improving. This can be multi-select and future-facing.

```text
sourceLanguage
```

The language detected or selected for a specific media item.

```text
targetLanguage
```

The language used for a specific processing job.

User-facing wording should be:

```text
App language
Translate subtitles to
Languages you watch or study
Source language
```

Avoid ambiguous wording like:

```text
Main language
Primary language
Native language
Learning language
```

unless the product truly needs that distinction.

## 4. Recommended Long-Term Information Architecture

A clean production mobile IA could be:

```text
Home / Library
Create
Vocabulary
Settings
```

Alternative with center action:

```text
Library
[Create CTA]
Vocabulary
Settings
```

The Create action can be a center tab, floating button, or prominent home CTA.

## 5. Production Onboarding Flow

Recommended flow:

```text
Launch
  -> Session restore
  -> Welcome
  -> Auth
  -> Verify OTP if needed
  -> App language
  -> Default translation language
  -> Languages user watches/studies
  -> Optional goal selection
  -> Home / first import
```

### 5.1 Welcome screen

Goal: explain the product in one screen.

Suggested copy:

```text
Turn videos, audio, and YouTube links into bilingual subtitles.
Watch with karaoke timing, save words, and learn from real content.
```

Primary CTA:

```text
Get started
```

Secondary CTA:

```text
Try sample
```

### 5.2 Auth screen

Recommended options:

```text
Continue with Google
Continue with Apple
Continue with email
Log in
```

Auth-first is reasonable because Kapter needs user history, quotas, subscriptions, media jobs, and saved artifacts.

A future demo mode can let anonymous users try a preloaded sample without creating a real processing job.

### 5.3 App language screen

User-facing title:

```text
Choose app language
```

Options:

```text
English
Vietnamese
```

This controls UI only.

### 5.4 Default translation language screen

User-facing title:

```text
Translate subtitles to
```

Options for v1:

```text
Vietnamese
English
```

This should map to the default `targetLanguage`.

### 5.5 Languages you watch or study

User-facing title:

```text
What languages do you usually watch or study?
```

Possible options:

```text
English
Vietnamese
Japanese
Korean
Chinese
Other
```

If the backend does not support all languages yet, mark future languages carefully or do not expose unsupported options as processable languages.

### 5.6 Goal selection

Optional but useful for personalization.

Options:

```text
Learn from YouTube
Watch movies/videos
Study lectures
Create subtitle files
Build vocabulary
```

Do not make this screen required if it slows down first use.

## 6. Production Home / Library

The library is the command center.

### 6.1 Empty state

Suggested copy:

```text
No subtitles yet.
Upload a video, audio file, or paste a YouTube link to generate bilingual subtitles.
```

Primary CTA:

```text
Create subtitles
```

Secondary CTA:

```text
Try sample
```

### 6.2 Media card

A production media card should show:

```text
Title
Source type: YouTube / Local file / Audio
Status: Processing / Ready / Failed
Progress stage
Duration
Language pair
Created date
Quota consumed
```

Useful CTAs:

```text
Open player
View progress
Retry
Export
Delete
```

### 6.3 Library filters

For later production:

```text
All
Processing
Ready
Failed
YouTube
Uploads
Favorites
```

### 6.4 Sorting

For later production:

```text
Newest
Oldest
Longest
Recently watched
```

## 7. Production Create / Import Flow

Recommended flow:

```text
Create
  -> Choose source
  -> Source-specific input
  -> Pre-processing setup
  -> Quota preview
  -> Submit job
  -> Processing screen
```

### 7.1 Choose source

Options:

```text
Upload video
Upload audio
Paste YouTube link
```

Future options:

```text
Import from Files
Import from Photos
Paste from clipboard
Record audio
Batch import
```

### 7.2 YouTube submit

Fields:

```text
YouTube URL
Optional display title
Translate subtitles to
```

Helpful UX:

- Auto-detect pasted clipboard link if possible
- Show preview title/thumbnail if backend supports it
- Validate obvious invalid URLs before submit

### 7.3 Local upload

Recommended sequence:

```text
Pick file
Inspect type and duration
If video, extract audio locally
Request presigned URL
Upload directly to object storage
Confirm upload
Create media job
```

User-facing states:

```text
Preparing file
Extracting audio
Uploading
Starting processing
```

### 7.4 Pre-processing setup

Fields:

```text
Title
Source type
Duration
Detected/selected source language
Translate subtitles to
Estimated quota usage
Current plan usage
```

Only expose a few controls for v1:

```text
Translate to
Show source + translation
Enable karaoke timing
Save words from taps
```

## 8. Production Processing Screen

The processing screen should avoid feeling like a dead waiting page.

### 8.1 Status stages

Recommended visible stages:

```text
Uploading
Validating media
Preparing audio
Transcribing speech
Translating subtitles
Aligning words
First subtitles ready
Finalizing
Completed
```

### 8.2 Early player CTA

When translated batches exist:

```text
First subtitles are ready.
You can start watching while Kapter finishes the rest.
[Open player now]
```

This is a core differentiator.

### 8.3 Background reassurance

Copy:

```text
You can leave this screen. Processing will continue in your library.
```

### 8.4 Failure states

Important error cases:

```text
Unsupported YouTube link
File too large
Media too long for current plan
No speech detected
Upload interrupted
Quota exceeded
Processing failed
Network disconnected
Source and target language are the same
```

Each error should have a recovery CTA:

```text
Retry
Choose another file
Upgrade plan
Change language
Contact support
```

## 9. Production Player UX

The player is the product’s “aha moment”.

### 9.1 Core player layout

Possible layout:

```text
Media area
Current subtitle stack
Playback controls
Progress/scrubber
Subtitle layer controls
Dictionary/vocabulary bottom sheet
```

### 9.2 Subtitle display modes

Recommended modes:

```text
Bilingual
Source only
Translation only
Karaoke
Compact
```

### 9.3 Subtitle layer toggles

Possible toggles:

```text
Show source text
Show translation
Show phonetic
Highlight active word
Auto-scroll subtitles
```

### 9.4 Learning controls

Power features:

```text
Tap word for dictionary
Replay sentence
Loop sentence
Auto-pause after sentence
Save word
Save phrase
Playback speed
```

### 9.5 Long-session UX

For long videos:

```text
Chapter-like segment list
Search transcript
Jump to subtitle
Recently viewed position
Continue watching
Memory-safe virtualized transcript rendering
```

### 9.6 Incremental playback UX

When final output is not ready:

```text
Available subtitles: 0:00 - 4:30
More subtitles are being translated...
```

When user scrubs past available range:

```text
This part is still processing.
```

When new batches arrive:

```text
New subtitles added
```

Avoid full-screen reloads.

## 10. Vocabulary and Dictionary

Vocabulary should support language learning without turning the whole app into a course platform.

### 10.1 Word tap bottom sheet

On word tap:

```text
Word
Pronunciation / phonetic
Meaning
Current sentence
Translated sentence
Save word
Replay sentence
```

### 10.2 Vocabulary screen

Possible sections:

```text
Saved words
Saved phrases
Grouped by media
Recently saved
Review later
Search
```

### 10.3 Review mode

Future ideas:

```text
Flashcards
Listening review
Cloze deletion
Sentence replay
Spaced repetition
```

This can be a later paid feature.

## 11. Subscription and Quota UX

Subscription UX should be integrated into processing, not hidden only in settings.

### 11.1 Usage unit

Use minutes processed as the main quota unit.

Example:

```text
42 / 120 minutes used this month
```

### 11.2 Plan examples

Possible tiers:

```text
Free
- Limited minutes/month
- Short media duration
- Standard queue
- Basic subtitle viewing

Pro
- More minutes/month
- Longer media
- Faster queue
- Export SRT/VTT
- Vocabulary history

Creator
- High monthly minutes
- Priority queue
- Batch processing
- Advanced exports
```

### 11.3 Paywall triggers

Natural upgrade moments:

```text
Before submitting a job without enough quota
When media duration exceeds plan limit
When user wants faster queue
When user wants advanced export
When monthly quota is exhausted
When user wants batch processing
```

### 11.4 Quota exceeded screen

Should explain:

```text
You need 18 minutes to process this media.
You have 6 minutes left this month.
```

CTAs:

```text
Upgrade plan
Choose shorter media
Wait until renewal
```

## 12. Production Settings Screen

### 12.1 Account

```text
Profile
Email
Change password
Manage sessions
Log out
Delete account
```

### 12.2 App preferences

```text
App language
Theme: System / Light / Dark
Notifications
```

### 12.3 Subtitle defaults

```text
Default translation language
Default subtitle layout
Show source subtitles
Show translated subtitles
Show phonetic text
Karaoke word highlight
Subtitle font size
```

### 12.4 Processing defaults

Keep minimal:

```text
Default target language
Auto-detect source language
Save completed subtitles to library
```

Avoid exposing advanced AI internals in normal settings.

### 12.5 Subscription and usage

```text
Current plan
Monthly minutes used
Renewal date
Upgrade plan
Billing history
```

### 12.6 Storage and privacy

```text
Delete media item
Delete all processed files
Download my data
Privacy policy
Terms
```

Soft-delete behavior should be explained clearly if usage/billing records are retained for auditability.

### 12.7 Support/about

```text
Help center
Report a problem
Send feedback
App version
```

## 13. Export and Sharing

Production export screen:

```text
Export as SRT
Export as VTT
Export source-only transcript
Export translated-only transcript
Export bilingual transcript
Export JSON
Copy transcript
Share file
```

Possible paid gating:

```text
Free: copy short transcript
Pro: SRT/VTT export
Creator: batch export and advanced formats
```

## 14. Notifications

Do not ask for notification permission during onboarding.

Ask after the user submits their first long-running job:

```text
Get notified when subtitles are ready?
```

Notification types:

```text
Processing completed
Processing failed
Quota renewal
Subscription/payment issue
```

## 15. Analytics / Product Events

Useful events:

```text
onboarding_started
onboarding_completed
auth_started
media_create_started
media_source_selected
youtube_url_submitted
local_file_selected
upload_started
upload_completed
processing_started
translated_batch_ready
player_opened_before_final
player_opened_after_final
word_tapped
word_saved
export_started
export_completed
quota_paywall_shown
subscription_started
```

These events should be privacy-aware and should not log raw media content, subtitle text, token values, or sensitive file URLs.

## 16. Production Error UX

Every error should answer:

```text
What happened?
Why did it happen?
What can the user do next?
```

Bad:

```text
Error 500
```

Good:

```text
We couldn’t process this file.
The audio may be empty or unsupported.
Try another file or contact support.
```

Error categories:

```text
Auth/session
Network
Upload
Validation
Quota
YouTube ingestion
AI processing
Artifact loading
Player hydration
Export
```

## 17. Suggested Roadmap

### V1: Production MVP

```text
Auth/session
Short onboarding
Library
Create/upload/YouTube
Quota preview UI if data exists
Socket-first processing screen
Open player from translated batches
Basic bilingual player
Basic settings
```

### V1.5: Better Player and Learning

```text
Karaoke polish
Layer toggles
Dictionary bottom sheet
Saved vocabulary
Transcript search
Resume playback
```

### V2: Monetization and Creator Features

```text
Subscription screen
Plan usage dashboard
Export SRT/VTT
Batch processing
Priority queue
Billing history
```

### V3: Advanced Learning

```text
Flashcards
Review schedule
Sentence loop playlists
Personal word history
Weak-word tracking
```

### V4: Team / Creator Workspace

```text
Projects
Folders
Shared libraries
Collaborative subtitle editing
Brand presets
Bulk export
```

## 18. V1 Scope Recommendation

For the immediate implementation plan, do not try to build everything in this document.

V1 should focus on:

```text
Launch/session restore
Welcome/auth
Minimal onboarding
Library home
Create/import
Pre-processing setup
Processing progress
Early open-player CTA
Incremental bilingual player
Production settings shell
```

Defer:

```text
Full billing implementation
Full dictionary backend
Flashcards
Advanced exports
Batch processing
Creator workspace
Complex analytics dashboard
```

## 19. Final Product Thesis

The main “aha” flow should be:

```text
Paste YouTube link
Kapter starts processing
First translated subtitles appear
User opens player before final processing completes
User watches bilingual subtitles with karaoke timing
User taps words and saves vocabulary
Final output becomes exportable
```

That is the production UX worth protecting.
