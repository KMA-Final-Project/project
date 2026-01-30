import sys
import os
import time

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, '..', 'src')
sys.path.append(src_path)

from core.translator_engine import TranslatorEngine, TranslationStyle

def test_phase2_llm():
    print("--- Testing Phase 2: LLM Integration ---")
    
    # 1. Init Engine
    # Assuming Ollama is running on localhost:11434 with qwen2.5:7b-instruct
    engine = TranslatorEngine()
    
    # 2. Test Data
    # Simple ambiguous text
    segments = [
        {"text": "Xin chào, tôi là một lập trình viên AI."},
        {"text": "Hôm nay trời đẹp quá, chúng ta đi dạo nhé?"},
        {"text": "Hey bro, check this out, it's sick!"} # Mixed lang/style
    ]
    
    print(f"Sending {len(segments)} segments to LLM for Analysis...")
    start_time = time.time()
    
    # 3. Test Analyze Content (VI Target)
    print("\n[TEST L1] Analyzing for Vietnamese Target...")
    try:
        result_vi = engine.analyze_content(segments, target_lang='vi')
        print(f"Detected Style: {result_vi.detected_style}")
        print(f"Detected Pronouns (VI): {result_vi.detected_pronouns}")
        
        if result_vi.detected_pronouns:
            print("[PASS] Pronouns detected for VI.")
        else:
            print("[WARN] No pronouns detected for VI (Might be valid if Neutral).")

    except Exception as e:
        print(f"[FAIL] VI Analysis Error: {e}")

    # 4. Test Analyze Content (EN Target - Should skip VI pronouns)
    print("\n[TEST L2] Analyzing for English Target...")
    try:
        result_en = engine.analyze_content(segments, target_lang='en')
        print(f"Detected Style: {result_en.detected_style}")
        print(f"Detected Pronouns (EN): {result_en.detected_pronouns}")
        
        if result_en.detected_pronouns is None:
             print("[PASS] Pronouns correctly ignored/null for EN.")
        else:
             print(f"[WARN] Pronouns returned for EN: {result_en.detected_pronouns} (Ideally should be None, but LLM might be chatty).")

    except Exception as e:
        print(f"[FAIL] EN Analysis Error: {e}")

    # 5. Test Translation (Direct Provider Call)
    print("\n--- Testing Direct Translation Call (VI -> EN) ---")
    try:
        context = result_vi # Use the rich context
        texts = ["Xin chào", "Tạm biệt"]
        print(f"Translating: {texts}")
        
        translations = engine.llm_provider.translate_batch(
            texts, 
            source_lang="vi", 
            target_lang="en", 
            context=context
        )
        print(f"Translations: {translations}")
        
        if len(translations) == 2:
             print("[PASS] Translation successful.")
        else:
             print("[FAIL] Translation count mismatch/failed.")

    except Exception as e:
        print(f"\n[ERROR] Translation failed: {e}")

if __name__ == "__main__":
    test_phase2_llm()
