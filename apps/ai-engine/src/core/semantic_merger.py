from __future__ import annotations

import json
from typing import List, Optional
from loguru import logger
from pydantic import BaseModel

from src.schemas import Sentence, Word
from src.core.llm_provider import LLMProvider
from src.core.prompts import SAFE_MERGE_SYSTEM_PROMPT

class MergedLine(BaseModel):
    text: str
    source_indices: List[int]

class SemanticMerger:
    """
    Advanced Optimization: Semantic Merging & Homophone Correction.
    SAFE VERSION: Strictly preserves character count and word timestamps.
    """
    
    def __init__(self):
        self.llm = LLMProvider()
        
    def process(self, sentences: List[Sentence], context_style: str = "Wuxia/Xianxia Song") -> List[Sentence]:
        """
        Process a list of raw ASR sentences.
        Groups broken lines and corrects homophones ONLY if character counts align.
        """
        if not sentences:
            return []
            
        logger.info(f"🧠 Semantic Merger (Safe): Processing {len(sentences)} segments...")
        
        # 1. Prepare Input
        input_lines = []
        for i, sent in enumerate(sentences):
            input_lines.append(f"[{i}] {sent.text}")
            
        input_text = "\n".join(input_lines)
        
        # 2. Prompt
        prompt = SAFE_MERGE_SYSTEM_PROMPT.format(
            context_style=context_style
        )
        prompt += f"\n\nINPUT DATA:\n{input_text}\n"
        
        # 3. Call LLM
        try:
            response = self.llm.generate(prompt)
            merged_data = self._parse_response(response)
            
            if not merged_data:
                logger.warning("No valid merged data returned. Keeping original.")
                return sentences
                
            # 4. Reconstruct with Validation
            new_sentences = []
            processed_indices = set()
            
            for item in merged_data:
                indices = item.source_indices
                corrected_text = item.text
                
                # Validation: Indices valid?
                if not indices: continue
                valid_indices = [idx for idx in indices if 0 <= idx < len(sentences)]
                if not valid_indices: continue
                
                # Check overlaps (duplicates) from LLM?
                # Ideally LLM consumes each index once.
                # If overlap, ignore or proceed? Let's proceed but track coverage.
                
                # Validation: LENGTH CHECK
                source_sents = [sentences[idx] for idx in valid_indices]
                original_text_combined = "".join([s.text for s in source_sents])
                
                if len(corrected_text) != len(original_text_combined):
                    logger.warning(f"Length Mismatch for indices {valid_indices}: '{original_text_combined}'({len(original_text_combined)}) vs '{corrected_text}'({len(corrected_text)}). REJECTING merge/correct.")
                    # Fallback: Just append original sentences as is
                    for s in source_sents:
                        if s not in new_sentences: # Avoid duplication if logic flawed
                            new_sentences.append(s)
                    continue
                
                # SUCCESS: Create Merged Sentence
                first_seg = source_sents[0]
                last_seg = source_sents[-1]
                
                # Concatenate Words (Preserve Metadata)
                all_words = []
                for s in source_sents:
                    all_words.extend(s.words if s.words else [])
                    
                # Update Characters in Words
                # We iterate through the NEW text chars and assign them to the OLD word objects
                # precisely because lengths matched.
                if len(all_words) == len(corrected_text):
                    for idx, char in enumerate(corrected_text):
                         all_words[idx].word = char
                else:
                    # Mismatch between word objects and text length?
                    # Whisper sometimes outputs "empty" text but has words, or punctuation issues.
                    # Best effort: Just update text, keep words as is?
                    # Or force update if possible.
                    # Safety: If counts match (ignoring whitespace), update.
                    pass 

                new_sent = Sentence(
                    text=corrected_text,
                    start=first_seg.start,
                    end=last_seg.end,
                    words=all_words
                )
                new_sentences.append(new_sent)
                
            logger.success(f"✨ Semantic Merge Complete: {len(sentences)} -> {len(new_sentences)} lines.")
            return new_sentences
            
        except Exception as e:
            logger.error(f"Semantic Merge Failed: {e}")
            return sentences

    def _parse_response(self, response: str) -> List[MergedLine]:
        """Parses JSON list of MergedLine objects."""
        try:
            clean_resp = response.strip()
            if "```json" in clean_resp:
                clean_resp = clean_resp.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_resp:
                clean_resp = clean_resp.split("```")[1].split("```")[0].strip()
                
            data = json.loads(clean_resp)
            results = []
            for item in data:
                if "text" in item and "source_indices" in item:
                    results.append(MergedLine(**item))
            return results
        except Exception as e:
            logger.error(f"Error parsing merge response: {e}")
            return []
