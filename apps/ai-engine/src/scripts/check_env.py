import torch
import onnxruntime as ort

print(f"1. Torch Version: {torch.__version__}")
print(f"2. CUDA Available in Torch: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"   - GPU Name: {torch.cuda.get_device_name(0)}")
    print(f"   - CUDA Version: {torch.version.cuda}")

print(f"\n3. ONNX Runtime Providers: {ort.get_available_providers()}")