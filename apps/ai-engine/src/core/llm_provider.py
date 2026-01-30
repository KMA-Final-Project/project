import json
import ollama
from loguru import logger
from typing import List, Dict, Any, Optional
from .translator_engine import ContextAnalysisResult, TranslationStyle, VietnamesePronoun
from .prompts import ANALYSIS_SYSTEM_PROMPT, TRANSLATION_SYSTEM_PROMPT, CORRECTION_SYSTEM_PROMPT

class LLMProvider:
    """
    Wrapper for LLM interactions (Ollama).
    """
    def __init__(self, model_name: str = "qwen2.5:7b-instruct", timeout: int = 30):
        self.model_name = model_name
        self.timeout = timeout
        logger.info(f"LLMProvider initialized with model: {self.model_name}")

    def analyze_context(self, text_samples: List[str], target_lang: str) -> ContextAnalysisResult:
        """
        Sends text samples to LLM to determine style and pronouns.
        """
        logger.info("Sending Analysis Request to LLM...")
        
        # Prepare Prompt values
        styles_list = ", ".join([e.value for e in TranslationStyle])
        
        # Dynamic Pronoun Logic
        if target_lang.lower() == 'vi':
            pronouns_list = ", ".join([e.value for e in VietnamesePronoun])
            pronoun_instruction = (
                f"For Vietnamese pronouns (Enum: {pronouns_list}):\n"
                "   - \"I/You\" in a formal speech -> \"Tôi / Bạn\" or \"Tôi / Quý khách\".\n"
                "   - \"I/You\" between friends -> \"Mình / Bạn\" or \"Tao / Mày\" (if aggressive/close).\n"
                "   - \"I/You\" in a romantic context -> \"Anh / Em\" (Male spk) or \"Em / Anh\" (Female spk).\n"
                "   - \"I/You\" in family -> Detect roles (Con/Bố, Mother/Child, etc).\n"
                "   - If unsure or neutral, default to \"Tôi / Bạn\"."
            )
            pronouns_enum_preview = pronouns_list
        else:
            # Generic/English Logic
            pronoun_instruction = "For pronouns: Identify the relationship (Formal, Friends, Romantic, Family) to guide translation choices if applicable."
            pronouns_enum_preview = "N/A (Not strict for this language)"

        system_msg = ANALYSIS_SYSTEM_PROMPT.format(
            styles=styles_list,
            pronouns=pronouns_enum_preview,
            pronoun_instruction=pronoun_instruction
        )
        
        user_msg = f"Text Samples:\n" + "\n".join(text_samples)
        
        try:
            response = ollama.chat(
                model=self.model_name,
                messages=[
                    {'role': 'system', 'content': system_msg},
                    {'role': 'user', 'content': user_msg},
                ],
                format='json', # Force JSON mode
                options={'temperature': 0.2} # Low temp for deterministic analysis
            )
            
            content = response['message']['content']
            logger.debug(f"LLM Analysis Response: {content}")
            
            # Parse JSON
            data = json.loads(content)
            
            # Convert string values to Enums (handling potential mismatches gracefully?)
            # Pydantic validation will handle this if we pass strict data, 
            # but let's assume LLM follows instructions effectively with 'format=json'.
            
            result = ContextAnalysisResult(**data)
            logger.info(f"Analysis Complete: Style={result.detected_style}, Pronouns={result.detected_pronouns}")
            return result
            
        except Exception as e:
            logger.error(f"LLM Analysis Failed: {e}")
            # Fallback to defaults
            return ContextAnalysisResult(
                detected_style=TranslationStyle.NEUTRAL,
                detected_pronouns=VietnamesePronoun.TOI_BAN,
                summary="Analysis failed. Defaulting to Neutral.",
                keywords=[]
            )

    def _parse_list_output(self, content: str, expected_count: int) -> Optional[List[str]]:
        """
        Robust JSON list parser.
        Handles: Raw List, Dict wrapping list, List of Dicts (if values share consistent key).
        """
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            logger.warning("JSON Decode Failed. Content is not valid JSON.")
            return None

        # Case 1: Direct List
        if isinstance(parsed, list):
            # Check if it's a list of strings
            if all(isinstance(i, str) for i in parsed):
                return parsed
            # Case 1b: List of Dicts (e.g. [{"text": "Tx1"}, {"text": "Tx2"}])
            # This is rare with current prompts but possible if model ignores instructions
            if all(isinstance(i, dict) for i in parsed) and len(parsed) > 0:
                # Try to extract first string value
                extracted = []
                first_key = list(parsed[0].keys())[0] 
                for item in parsed:
                    extracted.append(str(item.get(first_key, "")))
                return extracted

        # Case 2: Dict wrapping list (e.g. {"translations": [...]})
        if isinstance(parsed, dict):
            # 2a: Value is list
            for key, value in parsed.items():
                if isinstance(value, list) and all(isinstance(i, str) for i in value):
                    return value
            
            # 2b: Dict of Strings (e.g. {"1": "Text", "2": "Text"})
            # We assume order is preserved in Python 3.7+ dicts
            if all(isinstance(v, str) for v in parsed.values()):
                logger.warning("Parsed Dict of Strings. Converting to List.")
                return list(parsed.values()) # Return values as list

        return None

    def correct_text_batch(
        self, 
        texts: List[str], 
        context: ContextAnalysisResult
    ) -> List[str]:
        """
        Step 1.5: Fix Homophones/ASR errors before translation.
        """
        logger.info(f"Sending ASR Correction Batch ({len(texts)} items) to LLM...")
        
        system_msg = CORRECTION_SYSTEM_PROMPT.format(
            style=context.detected_style.value
        )
        user_msg = json.dumps(texts, ensure_ascii=False)
        
        for attempt in range(2): # Max 2 attempts for correction
            try:
                response = ollama.chat(
                    model=self.model_name,
                    messages=[
                        {'role': 'system', 'content': system_msg},
                        {'role': 'user', 'content': user_msg},
                    ],
                    format='json',
                    options={'temperature': 0.1} # Very low temp for correction
                )
                
                content = response['message']['content']
                # logger.debug(f"Correction Response (Attempt {attempt+1}): {content}")
                
                corrected_list = self._parse_list_output(content, len(texts))
                
                if corrected_list and len(corrected_list) == len(texts):
                    return corrected_list
                
                logger.warning(f"Correction output mismatch (Attempt {attempt+1}): Got {len(corrected_list) if corrected_list else 0}, Expected {len(texts)}")
                
            except Exception as e:
                logger.error(f"Correction attempt {attempt+1} failed: {e}")
        
        logger.error("All correction attempts failed. Returning original texts.")
        return texts # Fallback

    def translate_batch(
        self, 
        texts: List[str], 
        source_lang: str, 
        target_lang: str, 
        context: ContextAnalysisResult
    ) -> List[str]:
        """
        Translates a batch of texts using the provided context.
        Includes Retry Logic (Max 3 attempts).
        """
        logger.info(f"Sending Translation Batch ({len(texts)} items) to LLM...")
        
        if target_lang.lower() == 'vi':
            pronoun_enforcement = "STRICTLY use the provided Pronouns for 'I' and 'You'."
        else:
            pronoun_enforcement = "Adapt pronouns to fit the Context Summary relationships."

        system_msg = TRANSLATION_SYSTEM_PROMPT.format(
            source_lang=source_lang,
            target_lang=target_lang,
            style=context.detected_style.value,
            pronouns=context.detected_pronouns.value if context.detected_pronouns else "N/A",
            summary=context.summary,
            pronoun_enforcement=pronoun_enforcement
        )
        
        user_msg = json.dumps(texts, ensure_ascii=False)
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"Translation Attempt {attempt+1}/{max_retries}...")
                response = ollama.chat(
                    model=self.model_name,
                    messages=[
                        {'role': 'system', 'content': system_msg},
                        {'role': 'user', 'content': user_msg},
                    ],
                    format='json',
                    options={'temperature': 0.3}
                )
                
                content = response['message']['content']
                
                # Debug logging via file to avoid truncation
                with open("last_llm_response.txt", "w", encoding="utf-8") as f:
                    f.write(content)
                logger.debug(f"LLM Response (Attempt {attempt+1}) captured to file.")
                
                translated_list = self._parse_list_output(content, len(texts))
                
                if not translated_list:
                    logger.warning(f"Could not extract list from LLM response (Attempt {attempt+1})")
                    continue # Retry

                if len(translated_list) != len(texts):
                    logger.warning(f"Count mismatch (Attempt {attempt+1}): Sent {len(texts)}, Got {len(translated_list)}")
                    continue # Retry
                
                return translated_list # Success!

            except Exception as e:
                logger.error(f"LLM Translation Error (Attempt {attempt+1}): {e}")
        
        logger.error("All translation attempts failed.")
        return [] # Return empty list on failure

    def generate(self, prompt: str, system_prompt: str = None) -> str:
        """
        Generic generation method for flexible tasks.
        """
        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            response = ollama.chat(
                model=self.model_name,
                messages=messages,
                options={'temperature': 0.3}
            )
            return response['message']['content']
        except Exception as e:
            logger.error(f"LLM Generation Failed: {e}")
            raise e
