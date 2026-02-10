import os
import numpy as np
import soundfile as sf
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import torch

# Config
TARGET_SR = 16000
MODEL_NAME = "openai/whisper-small"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

# Test modèle
processor = WhisperProcessor.from_pretrained(MODEL_NAME)
model = WhisperForConditionalGeneration.from_pretrained(MODEL_NAME).to(DEVICE)
model.eval()

# Test fichier audio
test_file = os.path.join("..", "audio", "speaker_0m", "p001.wav")
y, sr = sf.read(test_file, dtype="float32", always_2d=False)
if sr != TARGET_SR:
    import librosa
    y = librosa.resample(y, sr, TARGET_SR)
    sr = TARGET_SR

inputs = processor(y, sampling_rate=sr, return_tensors="pt")
feats = inputs.input_features.to(DEVICE)
with torch.no_grad():
    pred_ids = model.generate(feats, max_new_tokens=32)
pred_text = processor.batch_decode(pred_ids, skip_special_tokens=True)[0]

print("✅ Audio loaded and transcribed successfully:")
print(pred_text)
