#!/usr/bin/env python3
"""
Backend script for single utterance analysis
Called by POST /api/analyze
Compatible with macOS Apple Silicon (M1 / M2)
"""

import json
import sys
import os
import base64
import subprocess
import numpy as np
import librosa
import soundfile as sf
import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration

# -------------------------
# Config
# -------------------------
TARGET_SR = 16000
MODEL_NAME = "openai/whisper-small"

# Apple Silicon safe device
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
print("Using device:", DEVICE, file=sys.stderr)
print("Python executable:", sys.executable, file=sys.stderr)

# -------------------------
# Load Whisper model (float32 safe for MPS)
# -------------------------
processor = WhisperProcessor.from_pretrained(MODEL_NAME)
model = WhisperForConditionalGeneration.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float32
).to(DEVICE)
model.eval()

forced_decoder_ids = processor.get_decoder_prompt_ids(
    language="en",
    task="transcribe"
)

# -------------------------
# Optional dependency (safe)
# -------------------------
try:
    import editdistance
except ImportError:
    editdistance = None

# -------------------------
# EQ profiles
# -------------------------
EQ_BANDS = [(0,250),(250,500),(500,2000),(2000,4000),(4000,6000),(6000,8000)]
EQ_PROFILES_DB = {
    "none": [0,0,0,0,0,0],
    "rock": [2,3,4,3,2,1],
    "pop": [1,2,3,3,2,1],
    "jazz": [0,1,2,2,1,0],
    "classic": [1,1,0,-1,-2,-3],
}

# -------------------------
# Helper functions
# -------------------------
def safe_read_audio(path, target_sr=TARGET_SR):
    y, sr = sf.read(path, dtype="float32", always_2d=False)
    if isinstance(y, np.ndarray) and y.ndim > 1:
        y = y.mean(axis=1)
    if sr != target_sr:
        y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
    return y.astype(np.float32), int(target_sr)

def rms(y):
    return float(np.sqrt(np.mean(y**2) + 1e-12))

def spectral_centroid_rolloff(y, sr):
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)))
    return centroid, rolloff

def apply_equalizer(y, sr, mode="none"):
    gains_db = EQ_PROFILES_DB.get(mode, [0,0,0,0,0,0])
    if mode == "none":
        return y
    # Transform dB -> linéaire
    gains_lin = 10 ** (np.array(gains_db) / 20.0)
    # FFT
    Y = np.fft.rfft(y)
    freqs = np.fft.rfftfreq(len(y), 1/sr)
    G = np.ones_like(freqs)
    for (fmin, fmax), g in zip(EQ_BANDS, gains_lin):
        idx = (freqs >= fmin) & (freqs < fmax)
        G[idx] *= g
    # Appliquer EQ
    Y_eq = Y * G
    y_eq = np.fft.irfft(Y_eq)
    return y_eq.astype(np.float32)

   

def normalize_text(s):
    return " ".join(str(s).lower().strip().split())

def cer(ref, hyp):
    if editdistance is None:
        return 0.0
    ref_n = normalize_text(ref)
    hyp_n = normalize_text(hyp)
    return editdistance.eval(ref_n, hyp_n) / max(1, len(ref_n))

def wer(ref, hyp):
    if editdistance is None:
        return 0.0
    ref_w = normalize_text(ref).split()
    hyp_w = normalize_text(hyp).split()
    return editdistance.eval(ref_w, hyp_w) / max(1, len(ref_w))

def audio_to_base64(y, sr):
    import io
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

# -------------------------
# Fix mislabeled speaker_0m files
# -------------------------
def fix_speaker0m_files(data_root):
    speaker0_dir = os.path.join(data_root, "audio", "speaker_0m")
    if not os.path.isdir(speaker0_dir):
        print("⚠️ dossier speaker_0m introuvable:", speaker0_dir, file=sys.stderr)
        return

    def file_type(path):
        try:
            out = subprocess.check_output(["bash", "-lc", f'file -b "{path}"'], text=True).strip()
            return out
        except Exception:
            return "unknown"

    def convert_to_wav_pcm(in_path, out_path):
        cmd = f'ffmpeg -y -hide_banner -loglevel error -i "{in_path}" -ac 1 -ar {TARGET_SR} -c:a pcm_s16le "{out_path}"'
        subprocess.check_call(["bash","-lc", cmd])

    bad = []
    for fn in sorted(os.listdir(speaker0_dir)):
        if not fn.lower().endswith(".wav"):
            continue
        p = os.path.join(speaker0_dir, fn)
        t = file_type(p)
        if any(x in t for x in ["ISO Media", "M4A", "MP4", "AAC", "Apple iTunes"]):
            bad.append((p, t))
    if bad:
        print(f"⚠️ {len(bad)} fichier(s) speaker_0m sont en réalité M4A/AAC. Conversion en WAV PCM...", file=sys.stderr)
        for p, t in bad:
            tmp_out = p + ".fixed.wav"
            convert_to_wav_pcm(p, tmp_out)
            os.replace(tmp_out, p)
        print("✅ Conversion terminée. speaker_0m est maintenant WAV correct.", file=sys.stderr)
    else:
        print("✅ speaker_0m est déjà un WAV correct (pas de conversion nécessaire).", file=sys.stderr)

# -------------------------
# Main analysis
# -------------------------
def run_analysis(utt_id, eq_mode, do_eq, transcribe_on, transcriber_cond, data_root):
    import pandas as pd

    # Fix mislabeled files first
    fix_speaker0m_files(data_root)

    logs = []

    try:
        meta_path = os.path.join(data_root, "metadata.csv")
        if not os.path.exists(meta_path):
            return {"error": f"Metadata file not found: {meta_path}"}

        df = pd.read_csv(meta_path)
        df["abspath"] = df["relpath"].apply(lambda p: os.path.join(data_root, p))

        outs = {}
        for cond in ["human", "speaker_0m", "speaker_3m"]:
            rows = df[(df.utt_id == utt_id) & (df.condition == cond)]
            if rows.empty:
                logs.append(f"[WARN] No row for {cond}")
                continue

            row = rows.iloc[0]
            audio_path = row["abspath"]
            if not os.path.exists(audio_path):
                logs.append(f"[WARN] Missing file: {audio_path}")
                continue

            y, sr = safe_read_audio(audio_path)
            if do_eq:
                y = apply_equalizer(y, sr, eq_mode)

            c, ro = spectral_centroid_rolloff(y, sr)
            outs[cond] = {
                "y": y,
                "sr": sr,
                "text": row["text"],
                "rms": rms(y),
                "centroid": c,
                "rolloff": ro,
            }
            logs.append(f"[OK] Loaded {cond}")

        if not outs:
            return {"error": f"No audio found for utt_id={utt_id}", "logs": "\n".join(logs)}

        pred_text = ""
        cer_val = wer_val = 0.0

        if transcribe_on and transcriber_cond in outs:
            y_in = outs[transcriber_cond]["y"]
            sr = outs[transcriber_cond]["sr"]

            inputs = processor(
                y_in,
                sampling_rate=sr,
                return_tensors="pt",
                truncation=True,
                padding="longest"
            )

            feats = inputs.input_features.to(DEVICE)

            gen_kwargs = {}
            if forced_decoder_ids is not None:
                gen_kwargs["forced_decoder_ids"] = forced_decoder_ids

            with torch.no_grad():
                pred_ids = model.generate(
                    feats,
                    max_new_tokens=64,
                    **gen_kwargs
                )

            pred_text = processor.batch_decode(
                pred_ids,
                skip_special_tokens=True
            )[0]

            ref_text = outs["human"]["text"] if "human" in outs else ""
            cer_val = cer(ref_text, pred_text)
            wer_val = wer(ref_text, pred_text)

            logs.append("[OK] Transcription done")

        measures = ""
        for label, key in [("Human","human"),("Speaker 0m","speaker_0m"),("Speaker 3m","speaker_3m")]:
            if key in outs:
                measures += (
                    f"{label:12}: RMS={outs[key]['rms']:.6f} | "
                    f"Centroid={outs[key]['centroid']:.1f} | "
                    f"Rolloff={outs[key]['rolloff']:.1f}\n"
                )

        if transcribe_on:
            measures += f"\nCER={cer_val:.4f} | WER={wer_val:.4f}\n"

        return {
            "audioHuman": audio_to_base64(outs["human"]["y"], outs["human"]["sr"]) if "human" in outs else "",
            "audio0m": audio_to_base64(outs["speaker_0m"]["y"], outs["speaker_0m"]["sr"]) if "speaker_0m" in outs else "",
            "audio3m": audio_to_base64(outs["speaker_3m"]["y"], outs["speaker_3m"]["sr"]) if "speaker_3m" in outs else "",
            "refText": outs["human"]["text"] if "human" in outs else "",
            "hypText": pred_text,
            "measures": measures,
            "logs": "\n".join(logs),
        }

    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "logs": traceback.format_exc()
        }

# -------------------------
# Entry point
# -------------------------
if __name__ == "__main__":
    input_data = json.load(sys.stdin)
    result = run_analysis(
        input_data.get("uttId", ""),
        input_data.get("eqMode", "none"),
        input_data.get("doEq", False),
        input_data.get("transcribeOn", False),
        input_data.get("transcriberCond", "human"),
        input_data.get("dataRoot", os.getcwd())
    )
    print(json.dumps(result))
