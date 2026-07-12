# VFX SYNTECH — Piano di sviluppo dettagliato

> Documento di riferimento del progetto. Aggiornato: 2026-07-11.
> Decisioni prese con il proprietario del progetto (State) — vedi §2.
>
> **Stato avanzamento (2026-07-12):** Fase 0 ✅ · Fase 1 ✅ · Fase 2 ✅ · Fase 3 ✅.
> Tutti e 5 gli effetti aprono la loro build reale nell'app ed esportano il ParamSchema
> completo — **132 parametri totali** (Blob Tracker 34, Analog 24, Blob Reveal 14,
> Bokeh 32, Anamorphic Lab 28), ognuno verificato con un round-trip set→changed.
> Gemini pilota i controlli veri via bridge (pulsante Gemini AI dentro ogni effetto);
> telemetria e cleanup attivi; three.js vendorizzato. Prossimo: **Fase 4 (export
> Master Quality)** oppure Fase 5 (porting + catena di effetti).

---

## 1. Visione

**VFX SYNTECH** è una web app per artisti e videomaker che hanno bisogno di effetti
**audio-reactive** e **video-reactive**. Si ispira ad After Effects (con AI integrata)
e a TouchDesigner (per la natura degli effetti), ma punta a essere **intuitiva** e a
**velocizzare drasticamente il workflow**, raccogliendo il meglio degli strumenti sul mercato.

Concetti fondanti:

1. **La home è un "cervello virtuale"** — il grafo animato in stile Obsidian già presente
   nell'app è la rappresentazione visiva del sistema: ogni nodo è un effetto, cliccarlo
   apre l'effetto vero.
2. **Ogni effetto è un modulo completo** — oggi esistono 5 effetti, ciascuno già costruito
   come HTML standalone funzionante (~7.000 righe l'uno): Blob Tracker, Analog,
   Blob Reveal, Bokeh, Anamorphic Lab.
3. **Tre modi di controllo per ogni parametro, anche in mix**:
   - **Manuale** — slider, pad XY, toggle;
   - **Automatico** — reattività audio (mic/analisi spettrale) e video (motion, blob, flow);
   - **AI (Gemini)** — l'AI legge lo stato e pilota i parametri ("rendilo più cinematografico").
4. **Effetti combinabili in catena** (obiettivo di lungo periodo) — come lo stack di effetti
   di After Effects o i nodi di TouchDesigner: es. sorgente video → Blob Tracker → Analog → output.

---

## 2. Decisioni prese (registro)

| # | Tema | Decisione |
|---|------|-----------|
| 1 | Apertura effetto | L'effetto occupa **tutto il terminale** dell'app, con tasto **back** per tornare alla home |
| 2 | Combinabilità | Gli effetti dovranno essere **combinabili in catena** (fase avanzata) |
| 3 | Estetica | **Terza estetica, da definire** (né il nero/oro attuale né il viola dell'HTML) → tutto va costruito su design token tematizzabili |
| 4 | Metodo | **Step 1: iframe** (effetti HTML incapsulati, subito funzionanti) → **Step 2: porting** in React/motore condiviso |
| 5 | Altri 4 effetti | HTML analoghi al Blob Tracker, già pronti, verranno forniti uno alla volta |
| 6 | Ruolo AI | Gemini è **una delle automazioni**: controllo manuale, automatico, AI o mix |
| 7 | Piattaforma | Desktop-first; Chrome/Edge prioritari; Safari/Firefox secondari; mobile in seguito |
| 8 | Account/business | **Niente login né monetizzazione** per ora |
| 9 | Salvataggio | **localStorage basta** per la v1 (preset e sessioni per-browser) |
| 10 | Export | Presente nell'HTML (MediaRecorder). Obiettivo: **export MP4 di qualità "Premiere-like"** → vedi §8 |
| 11 | Reattività | Audio+video reactive già negli HTML; miglioramenti proposti prima di implementarli (§10) |
| 12 | AI provider | **Gemini** (nessuna API key personale: oggi la inietta AI Studio) → vedi §9 |
| 13 | Hosting | **Gratuito**, va bene anche dominio GitHub → vedi §9 |
| 14 | Grafo home | **Si tiene**: è l'identità visiva dell'app (Obsidian / cervello virtuale) |
| 15 | Lingua UI | **Inglese** |
| 16 | Priorità | A discrezione dello sviluppo → scelta: **Blob Tracker perfetto end-to-end, poi replicare** |
| 17 | Performance | Target **60 fps @ 1080p+** |
| 18 | Branding | Rimandato (nome VFX SYNTECH confermato per ora) |

---

## 3. Stato attuale del codice

### 3.1 La shell React (repo `vfx-syntech`)

- **Stack**: React 19 + Vite 6 + Tailwind 4 + Motion + Lucide; server Express (`server.ts`)
  con SDK `@google/genai`.
- **UI**: dashboard nero/oro a 3 colonne — pannello Gemini (Art Director / Agent / AI Optimizer),
  canvas centrale col grafo "cervello", libreria effetti a destra con 5 schede.
- **Cosa funziona**: il grafo home (con reattività al microfono), i 3 endpoint Gemini
  (`/api/gemini/chat`, `/optimize`, `/analyze` su `gemini-3.5-flash`), il day/night mode.
- **Cosa è finto**: gli slider dei 5 effetti modificano solo uno state React che non pilota
  nulla; i contatori (frames, latenza) sono simulati; Save/Projects/Contact nel menu sono
  segnaposto. **Cliccare un effetto non apre alcun effetto reale.**

### 3.2 Il Blob Tracker HTML (`public/effects/blob_tracker/index.html`)

App standalone completa (~6.800 righe, ~360 KB) già inserita in questa repo. Capacità:

- **Sorgenti**: file video, webcam, immagine, camera esterna (ImageCapture), drag & drop.
- **Tracking**: blob detection su buffer binario, contorni, optical flow, punti fissi,
  MediaPipe (pose, face mesh, segmentazione persona via tasks-vision WASM).
- **Rendering**: canvas 2D + Three.js r128 (modalità "panels" 3D con video texture), ripple,
  connessioni tra blob, etichette, effetti dentro i blob.
- **Reattività**: sezione **audio-reactive** (mic → mappatura su parametri) e
  **video-reactive** (motion → parametri).
- **Controlli**: pad XY, color picker, toggle (mirror, loop, dashed, labels…), fullscreen,
  play/pause/timeline.
- **Persistenza**: preset e sessioni (localStorage/IndexedDB).
- **Export**: registrazione realtime MediaRecorder (MP4/WebM secondo browser).
- **Dipendenze CDN**: three.js (cdnjs), MediaPipe (jsdelivr + Google storage), Google Fonts.

Gli altri 4 effetti (Analog, Blob Reveal, Bokeh, Anamorphic Lab) esistono come HTML
analoghi e verranno integrati con lo stesso procedimento.

---

## 4. Architettura target

### 4.1 Vista d'insieme

```
┌────────────────────────────── VFX SYNTECH SHELL (React) ──────────────────────────────┐
│  Home = grafo "cervello" (nodi → effetti)          Gemini panel      Effects library  │
│                                                                                       │
│  ┌──────────────── EffectHost (vista a schermo pieno nel terminale) ───────────────┐  │
│  │  FASE 1: <iframe src="/effects/<id>/index.html">  + Bridge postMessage          │  │
│  │  FASE 2+: <EffectModule> React nativo sul motore condiviso (SynEngine)          │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                       │
│  Bridge protocol ── Param Store (manual/auto/AI mix) ── Gemini client ── Preset store │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Perché iframe prima e porting poi

- **Iframe (Fase 1)**: l'HTML funziona già al 100%; incapsularlo garantisce zero regressioni
  e risultati immediati. Limite: comunicazione col resto dell'app solo via `postMessage`,
  e **nessuna possibilità di mettere gli effetti in catena** (copiare pixel tra iframe non
  regge i 60 fps).
- **Porting (Fase 2+)**: estrarre il motore di ogni effetto in moduli TypeScript che
  condividono un unico contesto WebGL. È l'unico modo per avere: catena di effetti,
  tema unico, AI che pilota tutto in modo profondo, export unificato. Si fa **un effetto
  alla volta**, tenendo la versione iframe come fallback finché il port non è alla pari.

### 4.3 Il contratto dell'effetto (Effect Contract)

Ogni effetto — iframe oggi, modulo nativo domani — rispetta lo stesso contratto, così la
shell non deve sapere come è fatto dentro. Protocollo `postMessage` (namespace `syntech:`):

**Shell → Effetto**

| Messaggio | Payload | Uso |
|---|---|---|
| `syntech:init` | `{ theme, lang }` | handshake all'apertura |
| `syntech:param:set` | `{ key, value, source: 'manual'\|'auto'\|'ai' }` | pilotare un parametro |
| `syntech:preset:apply` | `{ params: {...} }` | applicare un preset (anche generato da Gemini) |
| `syntech:transport` | `{ action: 'play'\|'pause'\|'record:start'\|'record:stop' }` | trasporto |
| `syntech:close` | — | la shell sta per chiudere l'effetto (cleanup) |

**Effetto → Shell**

| Messaggio | Payload | Uso |
|---|---|---|
| `syntech:ready` | `{ effectId, version, params: ParamSchema[] }` | l'effetto dichiara i suoi parametri |
| `syntech:param:changed` | `{ key, value }` | sync verso la shell |
| `syntech:state` | `{ fps, srcMode, recording }` | telemetria (footer/diagnostics veri) |
| `syntech:export:done` | `{ blobUrl, mime, filename }` | file registrato pronto |

**ParamSchema** (ciò che Gemini leggerà per pilotare l'effetto):

```ts
interface ParamSchema {
  key: string;            // es. "blobThreshold"
  label: string;          // es. "BLOB THRESHOLD"
  type: 'number' | 'boolean' | 'color' | 'enum' | 'xy';
  min?: number; max?: number; step?: number;
  value: unknown;
  group: string;          // es. "TRACKER", "AUDIO REACTIVE", "PANELS"
  reactive: boolean;      // può essere mappato su audio/video
  aiHint?: string;        // descrizione per il prompt di Gemini
}
```

Nella Fase 1 il contratto si implementa aggiungendo **un piccolo blocco JS in coda a ogni
HTML** (l'"adapter", ~100-200 righe) che espone i parametri già esistenti; l'HTML resta
autonomo e continua a funzionare anche aperto da solo.

### 4.4 Il sistema di controllo Manual / Auto / AI

Per ogni parametro con `reactive: true` la shell (e in Fase 1 l'effetto stesso, che ha già
le sezioni audio/video-reactive) gestisce una **matrice di controllo**:

```
valore finale = base(manuale) + peso_audio × segnale_audio + peso_video × segnale_video
                (+ override AI quando Gemini applica un preset o "prende il controllo")
```

- Gemini **non** sostituisce gli altri controlli: scrive valori base e pesi, quindi il mix
  manuale/auto/AI richiesto dalla decisione #6 è naturale.
- In Fase 2 questa matrice diventa un modulo condiviso (`src/engine/params/`), unico per
  tutti gli effetti — equivalente concettuale degli export CHOP di TouchDesigner.

---

## 5. Fasi di sviluppo

> Ordine scelto (decisione #16): **Blob Tracker perfetto end-to-end**, poi replicare il
> procedimento sugli altri 4. Ogni fase produce qualcosa di visibile e usabile.

### Fase 0 — Fondamenta della shell *(piccola)*

- [ ] View state nella shell: `home | effect:<id>` (senza router esterno; basta uno state).
- [ ] Componente **`EffectHost`**: occupa l'intero terminale (decisione #1), header minimale
      con nome effetto + tasto **← BACK**, monta l'iframe e gestisce il bridge.
- [ ] Modulo **`src/bridge/`**: tipi TypeScript del protocollo `syntech:*` (condivisi tra
      shell e adapter) + hook `useEffectBridge()`.
- [ ] Cartella `public/effects/<id>/index.html` come sede standard degli effetti (fatto per
      blob_tracker).
- [ ] Il grafo home resta la vista di default; cliccare il nodo/scheda "Blob Tracker" apre
      l'EffectHost.

### Fase 1 — Blob Tracker dentro l'app (iframe) *(il primo traguardo visibile)*

- [ ] Click su Blob Tracker (card della libreria **e** nodo del grafo) → EffectHost a schermo
      pieno con l'HTML reale, funzionante al 100% (webcam, video, audio reactive, export).
- [ ] Tasto back → ritorno alla home senza leak (stop webcam/mic/RAF alla chiusura, via
      `syntech:close`).
- [ ] Permessi iframe: `allow="camera; microphone; fullscreen; display-capture"`.
- [ ] Adapter minimo nell'HTML: `syntech:ready` + `syntech:state` (fps reali nel footer
      dell'app al posto dei contatori simulati).
- [ ] Fix pratici: fullscreen interno all'iframe, gestione resize, day-mode ignorato
      dall'effetto (per ora tiene il suo tema — l'estetica unica arriva con la decisione #3).

**Risultato:** l'app smette di essere una demo — il primo effetto è vero.

### Fase 2 — Bridge completo + Gemini che pilota l'effetto vero

- [ ] Adapter completo nel Blob Tracker: esporta il **ParamSchema** di tutti i parametri
      significativi e accetta `param:set` / `preset:apply`.
- [ ] Gli slider della colonna sinistra della shell mostrano/pilotano i **parametri veri**
      (sostituendo displacement/fluidDynamics/cellSize finti).
- [ ] `server.ts`: i tre endpoint Gemini ricevono il ParamSchema reale (con `aiHint`) invece
      dei parametri finti → **AI Optimizer** e **Agent** applicano preset che cambiano
      davvero l'effetto.
- [ ] Preset unificati: i preset del tracker diventano leggibili/salvabili anche dalla shell
      (localStorage condiviso tramite bridge).
- [ ] UI della matrice Manual/Auto/AI (versione semplice: badge sul parametro che indica
      chi lo sta controllando).

**Risultato:** il flusso completo manuale + automatico + AI funziona su un effetto reale.

### Fase 3 — Gli altri 4 effetti *(ripetibile, uno alla volta)*

Per ogni HTML consegnato (Analog → Blob Reveal → Bokeh → Anamorphic Lab, o nell'ordine di
consegna):

- [ ] Copia in `public/effects/<id>/index.html`.
- [ ] Applicazione della **checklist adapter** (§7) — stesso blocco JS della Fase 2.
- [ ] Collegamento card/nodo → EffectHost.
- [ ] QA con la **Definition of Done** (§11).

**Risultato:** libreria "5 SYSTEMS" tutta vera. Da qui l'app è presentabile.

### Fase 4 — Export engine di qualità *(vedi dettaglio §8)*

- [ ] Preset "Master Quality": rendering **offline frame-per-frame** (non realtime) con
      **WebCodecs** + muxing MP4 → qualità costante, nessun frame perso, bitrate altissimo.
- [ ] Opzione sequenza PNG (per compositing esterno in Premiere/AE).
- [ ] Muxing audio (traccia del video sorgente o registrazione mic).
- [ ] Fallback MediaRecorder per browser senza WebCodecs (Safari vecchi).

### Fase 5 — Catena di effetti (SynEngine) *(il progetto grande)*

Prerequisito: porting (lo "step 2" della decisione #4). Non si può fare con gli iframe.

- [ ] **`src/engine/`**: render graph minimale — `SourceNode` (video/webcam/img) →
      `EffectNode[]` → `OutputNode`, un solo contesto WebGL, passaggio via texture.
- [ ] Porting del **core di rendering del Blob Tracker** a `EffectNode` (la UI resta React).
- [ ] Porting del secondo effetto più semplice (probabilmente **Analog**: CRT/jitter/chroma
      sono shader puri, ideali come primo nodo di catena).
- [ ] MVP catena: **2 effetti in serie** a 60 fps @ 1080p (es. Blob Tracker → Analog).
- [ ] UI di chaining coerente col "cervello": nel grafo home, **collegare due nodi = creare
      la catena** (l'identità Obsidian diventa funzionale, non solo estetica).
- [ ] Porting progressivo dei restanti effetti; la versione iframe resta il fallback finché
      ogni port non è alla pari.

### Fase 6 — Estetica finale, performance, rifinitura

- [ ] Applicazione della **terza estetica** (decisione #3) quando definita: si costruisce fin
      da subito tutto su design token CSS (`--syn-bg`, `--syn-accent`, font slot…), così il
      re-skin sarà una sostituzione di variabili, non una riscrittura.
- [ ] Performance pass per 60 fps @ 1080p+ (§6).
- [ ] Vendoring delle dipendenze CDN (three.js, MediaPipe) dentro la repo per affidabilità
      e versioni bloccate.
- [ ] QA cross-browser (Chrome/Edge → Safari/Firefox), gestione permessi negati, empty state.
- [ ] Pulizia voci segnaposto (Save/Projects/Contact) o loro implementazione minima.

---

## 6. Performance (target: 60 fps @ 1080p+)

Budget: ~16,6 ms/frame. Linee guida che valgono per tutti gli effetti:

1. **Analisi su buffer ridotto**: blob detection / motion / flow su un downscale
   (es. 320×180), rendering a piena risoluzione. Il Blob Tracker già lavora così: mantenere.
2. **MediaPipe con delegate GPU** e frequenza ridotta (segmentazione ogni 2-3 frame,
   interpolazione tra i frame).
3. **`requestVideoFrameCallback`** al posto di polling per i video.
4. **Risoluzione interna adattiva**: se il frame time supera il budget, scala la risoluzione
   di rendering e mostra l'indicatore nel pannello Diagnostics (che così diventa vero).
5. In Fase 5: un solo contesto WebGL condiviso, niente copie CPU↔GPU tra nodi della catena.
6. Da valutare (Fase 5+): analisi in **Web Worker + OffscreenCanvas** per liberare il main thread.

---

## 7. Checklist adapter (per ogni HTML che arriva)

Procedura standard, ripetibile in una sessione di lavoro per effetto:

1. Copia in `public/effects/<id>/index.html`; verifica che apra e funzioni da solo.
2. Censimento parametri: individuare le variabili/controlli esistenti e compilare il
   ParamSchema (`key`, `min/max`, `group`, `reactive`, `aiHint`).
3. Incolla del blocco adapter standard (in coda al file): listener `message`, invio
   `syntech:ready`, mappatura `param:set` → setter esistenti, hook su `syntech:close`
   per stop di webcam/mic/RAF/registrazioni.
4. Test permessi iframe (camera/mic/fullscreen) e resize.
5. Collegamento nella shell: voce nel registry effetti (`src/effects-registry.ts`:
   id, nome, descrizione, path iframe, stato porting).
6. QA con la Definition of Done (§11).

---

## 8. Export "Premiere-like": cosa è possibile nel browser

**Oggi** (dentro l'HTML): `MediaRecorder` su `captureStream()` — registra in tempo reale.
Limiti: il bitrate è deciso dal browser, i frame possono saltare se la macchina è sotto
carico, la qualità non è deterministica.

**Obiettivo (Fase 4)** — render **offline**, come fa un NLE:

1. Si mette in pausa il realtime e si scorre il video sorgente **frame per frame** (seek
   preciso / `requestVideoFrameCallback`).
2. Ogni frame viene renderizzato con l'effetto e passato a **WebCodecs `VideoEncoder`**
   (H.264 High profile) a bitrate altissimo → **nessun frame perso, qualità costante**.
3. Muxing in MP4 nel browser (libreria `mp4-muxer`, zero server), audio incluso.

**Nota di onestà tecnica sul "lossless"**: l'H.264 realmente lossless e i codec intermedi
(ProRes, DNxHD) non sono codificabili nativamente nel browser. Le opzioni reali:

- **"Master Quality" H.264 a bitrate molto alto** → visivamente indistinguibile
  dall'originale, file compatibili ovunque. *(Raccomandato come default.)*
- **Sequenza PNG** (zip di frame) → *matematicamente* lossless, perfetta da importare in
  Premiere/AE per il compositing, ma file grandi. *(Opzione "for compositing".)*
- Codifica ProRes via ffmpeg.wasm: possibile ma lentissima e pesante — solo se un giorno
  servirà davvero.

---

## 9. Gemini e hosting (senza API key personale, gratis)

Situazione: gli endpoint Gemini vivono in `server.ts` (Express) e la key oggi è iniettata
da **AI Studio** al deploy (Cloud Run). GitHub Pages invece serve **solo file statici**:
gli effetti funzionerebbero tutti (sono 100% client-side), ma gli endpoint `/api/gemini/*` no.

**Strategia a doppio binario:**

1. **Deploy AI-completo → AI Studio (attuale)**: si continua a pubblicare da AI Studio,
   che fornisce hosting Cloud Run gratuito e GEMINI_API_KEY iniettata. Nessun costo,
   nessuna key da gestire. *(Binario principale finché esiste.)*
2. **Deploy statico → GitHub Pages** (opzionale, in più): build Vite pubblicata gratis con
   dominio `*.github.io`. Gli effetti funzionano tutti; per l'AI si aggiunge la modalità
   **"bring your own key"**: campo nelle impostazioni dove incollare una key gratuita di
   [aistudio.google.com](https://aistudio.google.com) (salvata solo in localStorage), con
   chiamate a Gemini direttamente dal client. Se la key manca, i tre pulsanti AI si
   disattivano con un tooltip esplicativo — il resto dell'app resta pieno.

Il codice va scritto perché entrambi i binari convivano (feature detection: se `/api/gemini`
risponde usa il server, altrimenti client-side con key locale).

---

## 10. Miglioramenti proposti (da approvare prima di implementare)

Come concordato (decisione #11): idee elencate qui, si implementano solo dopo conferma.

| Proposta | Cosa aggiunge | Costo |
|---|---|---|
| **Audio da file** | Reattività su una traccia musicale caricata (non solo mic) — fondamentale per music video | Basso |
| **BPM / tap tempo** | Pulsazioni degli effetti sincronizzate al tempo del brano | Basso |
| **Web MIDI** (Chrome/Edge) | Controller MIDI fisici che pilotano i parametri, stile VJ | Medio |
| **Audio di sistema** | Reattività sull'audio del computer via condivisione schermo con audio | Basso (UX da spiegare) |
| **Randomize / A-B morph** | Tasto "sorprendimi" e morphing tra due preset | Basso |
| **Galleria preset per effetto** | Preset curati pronti all'uso, visibili come thumbnail | Medio |

---

## 11. Definition of Done (per ogni effetto integrato)

- [ ] Si apre dalla card della libreria **e** dal nodo del grafo; occupa tutto il terminale; back funzionante.
- [ ] Nessun errore in console; nessun leak alla chiusura (webcam/mic/RAF/recording fermati).
- [ ] 60 fps @ 1080p su hardware di riferimento (con sorgente video reale).
- [ ] ParamSchema esposto; almeno i parametri principali pilotabili dalla shell.
- [ ] AI Optimizer di Gemini modifica visibilmente l'effetto con un prompt sensato.
- [ ] Preset: salvataggio e ricaricamento funzionanti (localStorage).
- [ ] Export: registrazione avviabile/scaricabile dall'interno dell'effetto.
- [ ] Funziona in Chrome ed Edge; verificato (anche se degradato) in Firefox/Safari.

---

## 12. Struttura repo (a regime)

```
vfx-syntech/
├── PLAN.md                        ← questo documento
├── index.html / vite.config.ts / server.ts
├── public/
│   └── effects/                   ← Fase 1: gli HTML standalone (iframe)
│       ├── blob_tracker/index.html    ✅ già presente
│       ├── analog/…  blob_reveal/…  bokeh/…  anamorphic_lab/…
└── src/
    ├── App.tsx                    ← shell (home grafo + EffectHost switch)
    ├── effects-registry.ts        ← elenco effetti: id, nome, path, stato porting
    ├── bridge/                    ← protocollo syntech:* (tipi + hook React)
    ├── components/
    │   ├── VfxCanvas.tsx          ← grafo "cervello" (home, si tiene)
    │   ├── EffectHost.tsx         ← contenitore a schermo pieno + back
    │   └── …
    ├── effects/                   ← Fase 5: effetti portati in TS/React
    └── engine/                    ← Fase 5: SynEngine (render graph, param store)
```

---

## 13. Rischi principali e mitigazioni

| Rischio | Mitigazione |
|---|---|
| ~35.000 righe di HTML da portare (Fase 5) | L'iframe dà valore subito; il porting è incrementale e con fallback |
| Dipendenze CDN (three.js, MediaPipe) irraggiungibili o cambiate | Vendoring in repo (Fase 6); versioni già bloccate negli URL |
| Qualità MediaRecorder insufficiente | Fase 4 (WebCodecs offline render) |
| AI Studio potrebbe cambiare condizioni di hosting | Binario 2: GitHub Pages + BYO key già previsto |
| Safari: WebCodecs/MediaRecorder/MIDI limitati | Chrome/Edge dichiarati prioritari (decisione #7); degradazione controllata |
| Estetica finale non ancora definita | Design token fin da subito → re-skin senza riscritture |

---

## 14. Prossimi passi immediati

1. **[dev]** Fase 0 + Fase 1: EffectHost + Blob Tracker via iframe dentro l'app (primo
   traguardo visibile e testabile).
2. **[State]** Consegnare il secondo HTML quando pronto (consiglio: **Analog**, sarà anche
   il primo candidato al porting per la catena).
3. **[insieme]** Decidere quali proposte del §10 approvare.
4. **[State, quando vorrai]** Definire la terza estetica → basterà sostituire i design token.
