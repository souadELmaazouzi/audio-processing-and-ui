#!/usr/bin/env python3
import os
import subprocess

DATA_ROOT = "/Users/souad/Downloads/audio-processing-and-ui/loudspeaker_asr_dataset"

TARGET_SR = 16000

speaker0_dir = os.path.join(DATA_ROOT, "audio", "speaker_0m")


def file_type(path):
    try:
        out = subprocess.check_output(["bash","-lc", f'file -b "{path}"'], text=True).strip()
        return out
    except Exception:
        return "unknown"

def convert_to_wav_pcm(in_path, out_path):
    cmd = f'ffmpeg -y -hide_banner -loglevel error -i "{in_path}" -ac 1 -ar {TARGET_SR} -c:a pcm_s16le "{out_path}"'
    subprocess.check_call(["bash","-lc", cmd])

if os.path.isdir(speaker0_dir):
    bad = []
    for fn in sorted(os.listdir(speaker0_dir)):
        if not fn.lower().endswith(".wav"):
            continue
        p = os.path.join(speaker0_dir, fn)
        t = file_type(p)
        if ("ISO Media" in t) or ("M4A" in t) or ("MP4" in t) or ("AAC" in t) or ("Apple iTunes" in t):
            bad.append((p, t))
    if bad:
        print(f"⚠️ {len(bad)} fichier(s) speaker_0m à convertir...")
        for p, t in bad:
            tmp_out = p + ".fixed.wav"
            convert_to_wav_pcm(p, tmp_out)
            os.replace(tmp_out, p)
        print("✅ Conversion terminée.")
    else:
        print("✅ speaker_0m déjà OK.")
else:
    print("⚠️ dossier speaker_0m introuvable:", speaker0_dir)
