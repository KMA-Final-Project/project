import sys
import os

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, '..', 'src')
sys.path.append(src_path)

from core.translator_engine import TranslatorEngine, TranslationStyle, VietnamesePronoun

def test_phase1_logic():
    print("--- Testing Phase 1 Logic ---")
    
    # 1. Setup Data: 20 segments
    segments = [{"text": f"Segment {i}"} for i in range(20)]
    
    # 2. Init Engine
    engine = TranslatorEngine()
    
    # 3. Test Batch Slicing (Internal method test)
    batch = engine._get_analysis_batch(segments)
    print(f"Total segments: {len(segments)}")
    print(f"Batch size: {len(batch)}")
    
    if len(batch) == 15:
        print("[PASS] Batch slicing logic works (Limit 15).")
    else:
        print(f"[FAIL] Batch slicing logic failed. Got {len(batch)}")

    # 4. Test Public Method
    result = engine.analyze_content(segments, target_lang='vi')
    print(f"Result Type: {type(result)}")
    print(f"Result: {result}")
    
    if result.detected_style == TranslationStyle.NEUTRAL:
         print("[PASS] Mock result returned correctly.")
    else:
         print("[FAIL] Mock result mismatch.")

if __name__ == "__main__":
    try:
        test_phase1_logic()
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
