# Raw Data & Mentahan Jawaban Interview - Johannes Purba

Dokumen ini berisi rangkuman transkrip mentahan jawaban wawancara mendalam (*deep-dive interview*) untuk memperkuat profil, CV (`resume.html`), dan basis data otomatisasi pencarian kerja (`profile.json`).

---

## 🚀 Sesi 1: Target Role & Positioning

### 1. Target Role & Level
- **Fokus Role:** Individual Contributor (IC) - Senior Product Manager, AI Product Manager, atau Product Manager.
- **Preferensi kerja:** Ingin tetap *hands-on* secara teknis dan strategis, tidak mengincar role yang terlalu heavy di manajemen orang/tim.
- **Tipe Perusahaan:** Tech Startup, B2B Enterprise, serta menyasar Global Companies.
- **Model Kerja:** Preferensi utama *Remote*, namun untuk Indonesia (khususnya Jakarta) terbuka untuk *Hybrid* maupun *Onsite*.

### 2. AI Workflows & Tools
- **Brainstorming:** Selalu memanfaatkan AI untuk eksplorasi ide dan konsep awal.
- **Environment:** Bekerja sehari-hari menggunakan **VS Code** atau **AntiGravity IDE**.
- **Context Management:** Menyimpan folder-folder berisi file HTML/Markdown yang memuat konteks bisnis, laporan analisis, data user, serta transkrip interview user. Hal ini menjaga agar konteks tetap konsisten saat berinteraksi dengan LLM.
- **Documentation & Management:** Membuat PRD, *user story*, dan *acceptance criteria* langsung di Jira & Confluence terintegrasi via **MCP (Model Context Protocol)**.
- **Prototyping:** Membuat *quick prototype* langsung dari IDE untuk *usability testing* dan *feasibility testing* cepat bersama *design partner*.

### 3. Biggest Achievements
1. **Qoala (Qoala Plus):** Dipercaya membangun dan meluncurkan bisnis Qoala Plus dari 0 (*0-to-1 launch*) hingga rilis dan mendapatkan *early traction*.
2. **ASTRNT:** Memegang platform utama (Jobs Board) serta menginisiasi dan membangun platform baru CDC (*Career Development Center*) untuk kampus-kampus.

---

## 🚀 Sesi 2: Deep-Dive ASTRNT & AI Workflows

### 1. ASTRNT Core Platform & CDC Project
- **Value Proposition & Core Advantage:** ASTRNT memiliki keunggulan kuat di bidang *early screening mass hiring* (seperti *Management Associate / Graduate Programs* di *enterprise* besar).
- **Pain Point Solved:** Memangkas waktu dan biaya rekrutmen massal yang biasanya memproses ribuan hingga puluhan ribu pelamar.
- **CDC Platform Mechanics:** Menghubungkan lulusan universitas (CDC) dengan perusahaan mitra. Menggunakan metode *assessment* (seperti *asynchronous video interview*, *written questions*, dan *multiple-choice questions*) sehingga *screening* tahap awal jauh lebih cepat dan berkualitas tinggi dibanding sekadar sortir CV manual.

### 2. Enterprise Onboarding & 32% ARR Impact
- **End-to-End Involvement:** Terlibat langsung dari fase *discovery*, negosiasi/deal, hingga alur *onboarding* untuk memahami *recruitment business process* tiap enterprise.
- **Market Education:** Mengedukasi klien B2B agar beralih dari *traditional ATS* (filtering kata kunci CV) ke *competency-based assessment* menggunakan platform ASTRNT.
- **Core Features Delivered:** Mengembangkan fitur *Exporting & Importing Tools* untuk integrasi master data HRIS enterprise, serta serangkaian *product improvements* yang mempercepat proses seleksi kandidat.

### 3. Product Thinking & Codebase Prototyping
- **Workflow:** Menggunakan Antigravity IDE / VS Code yang terhubung langsung ke *repo staging/beta codebase*.
- **Design System Integration:** Memanfaatkan *existing design system* ASTRNT sehingga output *prototype* langsung mendekati *actual production code*, mempercepat pengujian *usability* dan *handover* ke eng team.
- **Concrete Example (Dynamic Reminder for Reviewers):**
  - **Tradisional:** Butuh desainer membikin mockup/prototype di Figma (~1 hari kerja) baru bisa di-assess.
  - **IDE Prototyping:** Bikin prototype langsung di IDE dalam **1–2 jam**, lalu langsung di-feasibility test dan *quick usability test*.
  - **Impact:** Memotong total *feature validation turnaround* dari **2–3 hari menjadi 1 hari saja** (efisiensi 60-70%).

---

## 🚀 Sesi 3: Deep-Dive Qoala & Past Roles

### 1. Qoala - Computer Vision & Automation
- **Technical Challenge:** Pertama kali mengimplementasikan *Computer Vision (CV)* dalam klaim asuransi. Harus mendalami *pipeline labeling*, pembuatan algoritma ML, dan memahami limitasi teknologi tersebut.
- **UX Solution:** Menyediakan petunjuk visual yang jelas (*visual guides*, *placeholders*, *framing*) pada saat user mengambil foto/video kerusakan agar input data presisi.
- **Impact & Turnaround:**
  - Klaim gadget/travel: Berubah menjadi *instant* (selesai dalam 1–2 menit).
  - Klaim mobil: Mengubah proses konvensional (berminggu-minggu) menjadi hitungan hari via *24/7 visual assessment dashboard* untuk *adjuster/assessor*.

### 2. Qoala Plus (0-to-1 Launch & Traction)
- **Target User:** Agen / Mitra Asuransi.
- **Traction & Metrics (6 Bulan Pertama):**
  - Meng-onboard **200+ agen aktif**.
  - Menghasilkan **IDR 50 – 70 Miliar Gross Written Premium (GWP)** dalam 6 bulan pertama rilis.

### 3. Qoala - Mass Scaling (60k -> 1.5M Transactions & 10x GMV)
- **System Architecture Optimization:** Bersama tim engineering mengidentifikasi bottleneck pada *single-queue node*. Memindahkan arsitektur penanganan transaksi ke *concurrent queuing* dengan *auto-scaling* menggunakan **Golang**.
- **0-to-1 International Expansion:** Menemukan *unmet need* traveler bus rute Malaysia - Singapura yang khawatir barang hilang saat pemeriksaan imigrasi border. Meluncurkan produk *micro-insurance* murah dengan *fair coverage*, yang menjadi pintu masuk sukses ekspansi internasional Qoala ke mitra-mitra bus ticketing lainnya.

---

## 🚀 Sesi 4: Metrik Kunci & Driver Retensi (Spesifik)

### 1. ASTRNT CDC Platform Metrics
- **Mitra Universitas:** Universitas Indonesia (UI) dan Universitas Kalbis/Horizon.
- **Screening Time Reduction:** Memangkas **83% waktu screening kandidat** untuk B2B enterprise client.

### 2. ASTRNT Retention Drivers (70% Customer Retention Rate)
- **Fitur Penentu Retensi:** Fitur **Transfer Candidate** dan **Asynchronous Video Interview** menjadi kunci utama enterprise client memperbarui kontrak dan mencegah *churn*.

### 3. Past Experience (XWORK, Porter, PegiPegi)
- **Lessons Learned:** Belajar banyak dari *trial & error*, mengamati senior talent, serta melakukan *self-directed research* mendalam mengenai proses bisnis industri (B2B SaaS, logistik, travel).
- **Core PM Philosophy:** 
  1. Sangat penting mendalami *actual user workflow* & *personas* (bagaimana user sesungguhnya menyelesaikan pekerjaan meeka).
  2. *Active listening:* Mendengar langsung cerita user/klien untuk menangkap *emotional friction* dan nilai penting yang tidak terlihat hanya dari data kuantitatif/visual.

