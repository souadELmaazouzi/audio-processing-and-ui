# Audio Processing and UI  
### Human vs Loudspeaker Speech Dataset (0m & 3m)

This project combines a **Next.js (TypeScript) frontend dashboard** with **Python-based audio analysis and evaluation scripts** to study the impact of **loudspeaker playback and distance** on **Automatic Speech Recognition (ASR)** performance.

The project is built around the **Human vs Loudspeaker Speech Dataset (0m & 3m)** and follows an experimental protocol inspired by recent **Whisper-based ASR evaluation works**.

---

## 📊 Dataset: Human vs Loudspeaker Speech Dataset (0m & 3m)

### Description
This dataset was created to analyze how **loudspeaker replay** and **propagation distance** affect speech quality and ASR transcription accuracy.

It contains paired recordings of:
- **Direct human speech** (natural speech)
- **Speech replayed through a loudspeaker** at **0 meters**
- **Speech replayed through a loudspeaker** at **3 meters**

The objective is to study **acoustic distortions** introduced by loudspeaker playback and their impact on ASR robustness.

---

## 🎙 Recording Protocol

- **Number of sentences:** 20 (fixed and predefined)
- **Speaker:** 1 human speaker
- **Recording device:** smartphone microphone (standard quality)
- **Loudspeaker:** consumer loudspeaker
- **Distances / conditions:**
  - Human (direct speech)
  - Loudspeaker at 0 m
  - Loudspeaker at 3 m
- **Environment:** quiet indoor room with minimal background noise
- **Sampling rate:** 16 kHz
- **Audio format:** WAV (lossless)

Each sentence was recorded three times:
1. Spoken directly by the human speaker  
2. Played through a loudspeaker at 0 m  
3. Played through a loudspeaker at 3 m  

---

## 📁 Dataset Structure

loudspeaker_asr_dataset/
│
├── audio/
│ ├── human/
│ │ ├── phrase_01.wav
│ │ ├── phrase_02.wav
│ │ └── ...
│ │
│ ├── speaker_0m/
│ │ ├── phrase_01.wav
│ │ ├── phrase_02.wav
│ │ └── ...
│ │
│ └── speaker_3m/
│ ├── phrase_01.wav
│ ├── phrase_02.wav
│ └── ...
│
├── metadata.csv
└── README.txt

---

## 🧾 Metadata

The file `metadata.csv` contains the following fields:
- `file_name`: audio file name  
- `sentence_id`: sentence index (1–20)  
- `text`: ground-truth transcription  
- `speaker_type`: `human` or `speaker`  
- `distance_m`: `0` or `3`  
- `environment`: `indoor`  
- `sample_rate`: `16000`  

---

## 🎯 Intended Use

- Evaluation of ASR robustness to loudspeaker playback
- Comparison between natural speech and replayed speech
- Testing and fine-tuning Whisper-based ASR models
- Academic, educational, and research purposes

---

## 🧩 Project Structure

audio-processing-and-ui/
├── app/ # Next.js dashboard (App Router)
├── components/ # Reusable UI components
├── hooks/ # Custom React hooks
├── lib/ # Utility functions
├── public/ # Static assets
├── scripts/ # Python analysis & evaluation scripts
├── models/ # ASR models / checkpoints (if used)
├── loudspeaker_asr_dataset/ # Dataset
├── package.json
└── next.config.mjs

---

## ⚙️ Requirements

### Frontend
- Node.js **18+**
- npm

### Backend
- Python **3.9+**
- Virtual environment (`venv`) recommended

---

## 🚀 Running the Project

### 1️⃣ Run the Frontend (Next.js)

From the project root:

```bash
npm install
npm run dev

Next.js 16.0.10 (Turbopack)
Local:   http://localhost:3000
Network: http://192.168.1.13:3000
Environments: .env.local
Open your browser at:
👉 http://localhost:3000

2️⃣ Run the Backend (Python Scripts)
Step A — Activate virtual environment
python -m venv .venv
source .venv/bin/activate   # macOS / Linux
# or
.\.venv\Scripts\activate    # Windows
Step B — Run scripts
cd scripts
Analysis phase:
python analyze.py
Evaluation phase:
python evaluate.py

analyze.py: acoustic / signal analysis
📝 Notes

Make sure the path to loudspeaker_asr_dataset/ is correctly set inside the Python scripts.

Additional dependencies may be required for ASR models (e.g., torch, transformers, librosa, soundfile).

For reproducibility, adding a requirements.txt file is recommended.
evaluate.py: ASR evaluation and comparison
.

📜 License

For academic and educational use only.
