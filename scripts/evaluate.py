#!/usr/bin/env python3
"""
Backend script for batch quantitative ASR evaluation
Supports: Whisper, Wav2Vec2, Vosk
Metrics: CER, WER, RMS, Spectral Centroid, Rolloff
EQ presets supported
JSON-safe output for frontend consumption
"""

# =====================
# SILENCE WARNINGS
# =====================
import os, warnings
warnings.filterwarnings("ignore")
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TRANSFORMERS_NO_ADVISORY_WARNINGS"] = "1"
os.environ["VOSK_LOG_LEVEL"] = "-1"

# =====================
# IMPORTS
# =====================
import json, sys, base64, io
import numpy as np
import pandas as pd
import librosa
import soundfile as sf
import torch
import editdistance
from scipy.signal import butter, lfilter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# =====================
# CONFIG
# =====================
TARGET_SR = 16000

# Device: prefer CUDA, then MPS, else CPU
if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

# =====================
# LOAD ASR MODELS
# =====================
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
from vosk import Model as VoskModel, KaldiRecognizer

# Whisper
WHISPER_NAME = "openai/whisper-small"
whisper_processor = WhisperProcessor.from_pretrained(WHISPER_NAME)
whisper_model = WhisperForConditionalGeneration.from_pretrained(WHISPER_NAME).to(DEVICE).eval()
forced_ids = whisper_processor.get_decoder_prompt_ids(language="en", task="transcribe")

# Wav2Vec2
W2V_NAME = "facebook/wav2vec2-base-960h"
w2v_processor = Wav2Vec2Processor.from_pretrained(W2V_NAME)
w2v_model = Wav2Vec2ForCTC.from_pretrained(W2V_NAME).to(DEVICE).eval()

# Vosk
VOSK_PATH = os.environ.get("VOSK_PATH", "models/vosk-model-small-en-us-0.15")
vosk_model = VoskModel(VOSK_PATH)

# =====================
# AUDIO UTILITIES
# =====================
def load_audio(path, logs):
    try:
        y, sr = sf.read(path, dtype="float32")
    except Exception as ex:
        logs.append(f"[load_audio] failed: {path} -> {ex}")
        y = np.zeros(TARGET_SR, dtype=np.float32)
        sr = TARGET_SR

    if isinstance(y, np.ndarray) and y.ndim > 1:
        y = y.mean(axis=1)

    if y is None or len(y) == 0:
        y = np.zeros(TARGET_SR, dtype=np.float32)

    if sr != TARGET_SR:
        try:
            y = librosa.resample(y, orig_sr=sr, target_sr=TARGET_SR)
            sr = TARGET_SR
        except Exception as ex:
            logs.append(f"[resample] failed (sr={sr}): {ex}")
            y = np.zeros(TARGET_SR, dtype=np.float32)
            sr = TARGET_SR

    return y.astype(np.float32), sr

def rms(y):
    return float(np.sqrt(np.mean(y**2) + 1e-12))

def spectral_features(y, sr):
    if y is None or len(y) == 0:
        return 0.0, 0.0
    c = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
    r = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))
    return float(c), float(r)

# =====================
# EQ FUNCTIONS
# =====================
def butter_bandpass(lowcut, highcut, fs, order=4):
    nyq = 0.5 * fs
    low = max(lowcut / nyq, 0.001)
    high = min(highcut / nyq, 0.999)
    return butter(order, [low, high], btype="band")

def apply_eq_filter(y, lowcut, highcut, gain):
    b, a = butter_bandpass(lowcut, highcut, TARGET_SR)
    return y + gain * lfilter(b, a, y)

def apply_eq(y, mode):
    if mode == "rock":
        y = apply_eq_filter(y, 100, 300, 0.7)
        y = apply_eq_filter(y, 4000, 8000, 0.5)
    elif mode == "pop":
        y = apply_eq_filter(y, 200, 400, 0.5)
        y = apply_eq_filter(y, 3000, 6000, 0.4)
    elif mode == "jazz":
        y = apply_eq_filter(y, 250, 500, 0.5)
        y = apply_eq_filter(y, 2000, 5000, 0.3)
    elif mode == "classic":
        y = apply_eq_filter(y, 100, 400, 0.4)
        y = apply_eq_filter(y, 2000, 6000, 0.2)
    return y

# =====================
# TEXT METRICS
# =====================
def normalize(text):
    return " ".join(str(text).lower().strip().split())

def cer(ref, hyp):
    ref_n = normalize(ref)
    hyp_n = normalize(hyp)
    if not ref_n:
        return 0.0
    return editdistance.eval(ref_n, hyp_n) / max(1, len(ref_n))

def wer(ref, hyp):
    ref_w = normalize(ref).split()
    hyp_w = normalize(hyp).split()
    if not ref_w:
        return 0.0
    return editdistance.eval(ref_w, hyp_w) / max(1, len(ref_w))

# =====================
# ASR FUNCTIONS
# =====================
def asr_whisper(y, sr):
    inputs = whisper_processor(y, sampling_rate=sr, return_tensors="pt").input_features.to(DEVICE)
    with torch.no_grad():
        ids = whisper_model.generate(
            inputs,
            forced_decoder_ids=forced_ids,
            max_new_tokens=64
        )
    return whisper_processor.batch_decode(ids, skip_special_tokens=True)[0]

def asr_wav2vec2(y, sr):
    inp = w2v_processor(y, sampling_rate=sr, return_tensors="pt").input_values.to(DEVICE)
    with torch.no_grad():
        logits = w2v_model(inp).logits
    pred = torch.argmax(logits, dim=-1)
    return w2v_processor.batch_decode(pred)[0]

def asr_vosk(y, sr):
    rec = KaldiRecognizer(vosk_model, sr)
    rec.SetWords(False)

    data = (y * 32767).astype(np.int16).tobytes()
    step = 4000
    for i in range(0, len(data), step):
        rec.AcceptWaveform(data[i:i+step])

    out = json.loads(rec.FinalResult())
    return out.get("text", "")

# =====================
# MAIN EVALUATION
# =====================
def run_evaluation(asr_backend, data_root, eq_mode, do_eq, condition):
    logs = []
    logs.append(f"[config] backend={asr_backend} condition={condition} doEq={do_eq} eqMode={eq_mode}")
    logs.append(f"[config] data_root={data_root} DEVICE={DEVICE} TARGET_SR={TARGET_SR}")
    logs.append(f"backend={asr_backend}, condition={condition}, doEq={do_eq}, eqMode={eq_mode}")
    logs.append(f"data_root={data_root}")
    meta_path = os.path.join(data_root, "metadata.csv")
    if not os.path.exists(meta_path):
        return {"error": f"metadata.csv not found at: {meta_path}", "logs": "\n".join(logs)}

    df = pd.read_csv(meta_path)
    if "relpath" not in df.columns or "utt_id" not in df.columns or "condition" not in df.columns:
        return {"error": f"metadata.csv missing required columns. Found: {list(df.columns)}", "logs": "\n".join(logs)}

    df["abspath"] = df["relpath"].apply(lambda p: os.path.join(data_root, str(p)))

    # Human references
    if "text" in df.columns:
        refs = df[df["condition"] == "human"].set_index("utt_id")["text"].to_dict()
        logs.append(f"[refs] human refs count={len(refs)}")
    else:
        refs = {}
        logs.append("[refs] WARNING: column 'text' not found, CER/WER will be 0")

    subset = df[df["condition"] == condition].copy()
    logs.append(f"[subset] rows={len(subset)} for condition={condition}")
      
    # if empty subset, return empty but valid JSON
    if len(subset) == 0:
        empty = {
            "backend": asr_backend,
            "detailedResults": [],
            "summary": [],
            "plotData": "",
            "logs": "\n".join(logs + [f"[subset] EMPTY: check condition names in metadata.csv"]),
        }
        return empty

    rows = []

    for idx, r in subset.iterrows():
        utt_id = str(r.get("utt_id", f"utt_{idx}"))
        abspath = str(r.get("abspath", ""))

        y, sr = load_audio(abspath, logs)
        if do_eq and eq_mode and eq_mode != "none":
            try:
                y = apply_eq(y, eq_mode)
            except Exception as ex:
                logs.append(f"[EQ] failed for {utt_id}: {ex}")

        ref = refs.get(utt_id, "")
        hyp = ""
        try:
            if asr_backend == "whisper":
                hyp = asr_whisper(y, sr)
            elif asr_backend == "wav2vec2":
                hyp = asr_wav2vec2(y, sr)
            elif asr_backend == "vosk":
                hyp = asr_vosk(y, sr)
            else:
                logs.append(f"[ASR] Unknown backend: {asr_backend}")
        except Exception as ex:
            logs.append(f"[ASR] failed for {utt_id}: {ex}")
            hyp = ""

        c, ro = spectral_features(y, sr)

        dist = r.get("distance_m", 0.0)
        try:
            dist = float(dist)
        except Exception:
            dist = 0.0

        rows.append({
            "utt_id": f"{utt_id}_{idx}",
            "distance_m": dist,
            "CER": float(cer(ref, hyp)),
            "WER": float(wer(ref, hyp)),
            "RMS": float(rms(y)),
            "centroid": float(c),
            "rolloff": float(ro),
        })

    df_det = pd.DataFrame(rows).fillna(0.0)

    # summary: numeric columns only (avoid pandas issues)
    num_cols = ["CER", "WER", "RMS", "centroid", "rolloff"]
    df_sum = df_det.groupby("distance_m")[num_cols].mean().reset_index()

    # Plot CER vs Distance
    plot_b64 = ""
    try:
        fig, ax = plt.subplots()
        ax.plot(df_sum["distance_m"], df_sum["CER"], marker="o")
        ax.set_xlabel("Distance (m)")
        ax.set_ylabel("CER")
        ax.set_title(f"CER vs Distance ({asr_backend})")
        ax.grid(True)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        plt.close(fig)
        plot_b64 = base64.b64encode(buf.getvalue()).decode()
    except Exception as ex:
        logs.append(f"[plot] failed: {ex}")
        plot_b64 = ""

    return {
        "backend": asr_backend,
        "detailedResults": df_det.to_dict("records"),
        "summary": df_sum.to_dict("records"),
        "plotData": plot_b64,
        "logs": "\n".join(logs),
    }

# =====================
# ENTRY POINT
# =====================
if __name__ == "__main__":
    try:
        inp = json.load(sys.stdin)

        result = run_evaluation(
            inp.get("asrBackend", "whisper"),
            inp.get("dataRoot", os.getcwd()),
            inp.get("eqMode", "none"),
            inp.get("doEq", False),
            inp.get("asrOnCondition", "speaker_3m"),
        )

        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e), "logs": f"[entry] {e}"}))
        sys.stdout.flush()
        sys.exit(0)
