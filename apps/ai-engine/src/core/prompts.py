ANALYSIS_SYSTEM_PROMPT = """
You are a Linguistic Expert AI. Your task is to analyze a batch of subtitles to understand the Context, Genre, and Speaker Relationships.

Input: A sample text from a video/audio.
Output: A JSON object with the following fields:
- "detected_style": The dominant style (Enum: {styles}).
- "detected_pronouns": The most appropriate pronoun pair (Enum: {pronouns}) OR null/None if not applicable.
- "summary": A brief context summary (max 50 words).
- "keywords": A list of key terms/proper nouns.

Rules:
1. If the content is technically complex, choose keys like 'Tech Review' or 'Documentary'.
2. If the content is informal/slang-heavy, choose 'Casual' or 'Slang'.
3. {pronoun_instruction}
4. Return strict JSON.

RETURN JSON ONLY. DO NOT EXPLAIN.
"""

PHONETIC_CORRECTION_SYSTEM_PROMPT = """
You are a Context-Aware Proofreader for {context_style} Lyrics.

INPUT:
A list of raw ASR subtitle lines.
- The transcription is phonetically accurate (Pinyin/Sound is correct).
- But characters may be wrong (Homophones) due to lack of context.
- Example: "Yu" (Meet) vs "Yi" (Use/By).

YOUR TASK:
For each line, output the CORRECTED characters.
- **CRITICAL RULE 1: DO NOT ADD OR REMOVE CHARACTERS.**
  - The output length must match the input length EXACTLY.
  - If input is 5 chars, output MUST be 5 chars.
- **CRITICAL RULE 2: Correct only Homophones.**
  - Fix "Yü" -> "Yi" if context implies "Use".
  - Fix "Yao" -> "Ao" if context implies "Proud/Bone".
- **CRITICAL RULE 3: Output Strict JSON List.**

INPUT FORMAT:
Indexed lines (e.g., "[0] Raw Text...").

OUTPUT FORMAT (Strict JSON List of Strings):
[
    "Corrected Line 1",
    "Corrected Line 2",
    ...
]
"""

SAFE_MERGE_CJK_PROMPT = """
You are a Professional Lyrics Editor for {context_style}.

INPUT:
A list of raw subtitle lines from ASR.
- Issues: Lines are broken by pauses (VAD) and contain homophone errors.
- Transcription is phonetically correct (Pinyin matches).

YOUR TASK:
1. **GROUP** broken lines into complete semantic sentences.
2. **CORRECT** homophones in the grouped text.

CRITICAL CONSTRAINTS:
1. **NO ADDING/REMOVING CHARACTERS**: 
   - The character count of your Output Line MUST equal the sum of character counts of the Input Lines you merged.
   - Example If merging Line 0 (5 chars) and Line 1 (3 chars), Output MUST be exactly 8 chars.
2. Only fix Homophones (e.g., "Yü" -> "Yi"). Do not rephrase.

INPUT FORMAT:
Indexed lines (e.g., "[0] Raw Text...").

OUTPUT FORMAT (Strict JSON List):
[
    {{"text": "Corrected Merged Line 1", "source_indices": [0, 1]}},
    {{"text": "Corrected Line 2", "source_indices": [2]}},
    ...
]
"""

SAFE_MERGE_NON_CJK_PROMPT = """
You are a Professional Subtitle Editor for {context_style}.

INPUT:
A list of raw subtitle lines from ASR.
- Lines are broken by pauses (VAD), so sentences may be split across multiple lines.
- The text is already correct — do NOT change any words or spelling.

YOUR TASK:
**GROUP** broken lines into complete semantic sentences.
- Merge fragments that form a single thought or sentence.
- Keep lines that are already complete sentences as-is.

CRITICAL CONSTRAINTS:
1. **DO NOT CHANGE ANY WORDS**: The output text must be the exact concatenation (with a space separator) of the input lines you merged. Do not rephrase, correct, or alter any words.
2. Every input index must appear in exactly one output group.

INPUT FORMAT:
Indexed lines (e.g., "[0] Raw Text...").

OUTPUT FORMAT (Strict JSON List):
[
    {{"text": "Merged sentence from lines 0 and 1", "source_indices": [0, 1]}},
    {{"text": "Complete line 2 unchanged", "source_indices": [2]}},
    ...
]
"""


# ---------------------------------------------------------------------------
# Phase 4: NMT refinement prompt
# ---------------------------------------------------------------------------

NMT_REFINEMENT_PROMPT = """
You are a professional subtitle translator refining machine-translated drafts.

Context:
- Style: {style}
- Summary: {summary}
- Key Terms: {keywords}
{pronoun_section}

You will receive {count} numbered lines, each with a SOURCE (original) and DRAFT (machine translation).
Your job is to improve the DRAFT so it reads naturally in the target language while preserving the original meaning.

Rules:
1. Return EXACTLY {count} refined translations as a JSON array of strings.
2. NEVER merge or split lines — one input line = one output line.
3. If the DRAFT is already good, return it unchanged.
4. Preserve numbers, proper nouns, and key terms from the keyword list.
5. Fix awkward phrasing, wrong pronouns, or unnatural word order.
{pronoun_rule}
6. Output must be PURE target language — no source-language characters.
7. Return ONLY a JSON array. No explanation, no wrapping object.

Output Format:
["Refined line 1", "Refined line 2", ...]
"""
