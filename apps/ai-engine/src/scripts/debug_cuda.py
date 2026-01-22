import torch
import onnxruntime as ort
import sys

print("=== Python Info ===")
print(sys.version)

print("\n=== PyTorch Info ===")
try:
    print(f"Torch Version: {torch.__version__}")
    print(f"CUDA Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA Device Name: {torch.cuda.get_device_name(0)}")
        print(f"CUDA Version: {torch.version.cuda}")
        print(f"CUDNN Version: {torch.backends.cudnn.version()}")
        print(f"Device Capability: {torch.cuda.get_device_capability(0)}")
        print(f"Arch List: {torch.cuda.get_arch_list()}")
except Exception as e:
    print(f"Torch Error: {e}")

print("\n=== ONNX Runtime Info ===")
try:
    print(f"ORT Version: {ort.__version__}")
    print(f"Available Providers: {ort.get_available_providers()}")
    print("Testing CUDA Provider loading...")
    try:
        sess = ort.InferenceSession("dummy.onnx", providers=["CUDAExecutionProvider"]) # Will fail if dummy missing, but logs might show provider issues
    except Exception as e:
        # We expect it to fail on file not found, but we want to see if it complains about provider
        # Creating a dummy model in memory is complex, so let's just check providers list
        pass
except Exception as e:
    print(f"ORT Error: {e}")
