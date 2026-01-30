import sys
import os
import json
import time

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, '..')
sys.path.append(src_path)

from core.translator_engine import TranslatorEngine

def test_chinese_translation():
    print("--- Testing Real-World Chinese Translation ---")
    
    # 1. Load Data
    json_path = os.path.join(current_dir, '..', '..', 'outputs', 'demo_audio_2_alignment.json')
    if not os.path.exists(json_path):
        print(f"[ERROR] file not found: {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} segments from {os.path.basename(json_path)}")
    
    # 2. Init Engine
    engine = TranslatorEngine()
    
    # 4. Run Two-Pass Workflow (Analyze -> Correct -> Translate)
    print("\n[Step 2] Running Two-Pass Workflow...")
    
    # We use a subset for testing speed
    test_batch = data[:8] # First 8 segments
    
    try:
        translations = engine.process_two_pass(
            test_batch,
            target_lang="vi"
        )
        
        print("\nFinal Results (CN -> VI):")
        for i, t in enumerate(translations):
            original = test_batch[i]['text']
            print(f" [{i+1}] CN: {original}")
            print(f"     VI: {t}")
            
    except Exception as e:
        print(f"[FAIL] Workflow Error: {e}")

if __name__ == "__main__":
    test_chinese_translation()
