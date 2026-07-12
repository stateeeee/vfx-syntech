# VFX SYNTECH — Piano di sviluppo dettagliato

> Documento di riferimento del progetto. Aggiornato: 2026-07-11.
> Decisioni prese con il proprietario del progetto (State) — vedi §2.
>
> **Stato avanzamento (2026-07-12):** Fase 0 ✅ · Fase 1 ✅ · Fase 2 ✅ · Fase 3 ✅.
> Tutti e 5 gli effetti aprono la loro build reale nell'app ed esportano il ParamSchema
> completo — **132 parametri totali** (Blob Tracker 34, Analog 24, Blob Reveal 14,
> Bokeh 32, Anamorphic Lab 28), ognuno verificato con un round-trip set→changed.
> Gemini pilota i controlli veri via bridge (pulsante Gemini AI dentro ogni effetto);
> telemetria e cleanup attivi; three.js vendorizzato. **Fase 4 ✅ su tutti e 5 gli
> effetti**: motore di export condiviso (`vendor/syntech-export.js`) — render offline
> frame-per-frame con WebCodecs (H.264 80 Mbps, fallback VP9/AV1), MP4 muxato
> in-browser, audio AAC, sequenza PNG lossless su cartella; pulsanti MASTER MP4 e
> PNG SEQUENCE nella sezione Export di ogni effetto, tutti verificati end-to-end.
> **Fase 5 MVP ✅**: SynEngine (`src/engine/`) — render graph nativo a singolo contesto
> WebGL2, nodi AnalogNode e BlobTrackerNode portati, vista **Chain Lab** nel menu con
> 2 effetti in serie (bypass, riordino, parametri live), verificata a livello di pixel.
> Parità round 1 ✅: AnalogNode con pipeline completa (pixel sort multi-pass →
> feedback persistente con zoom/rot/hue → CRT), BlobTrackerNode con FX dentro i blob
> (invert, thermal, security, glitch) — tutto verificato al pixel. Export Master della
> catena intera dal Chain Lab ✅ (verificato decodificando l'MP4 prodotto).
> **Parità round 2 ✅ — tutti e 5 gli effetti sono nodi nativi**: BlobRevealNode
> (blob su griglia 320×180 + maschera reveal erode/feather/opacity), BokehNode
> (disc blur Poisson/swirl/explosive/anamorphic in luce lineare + distorsione
> post-blur + ottica anamorfica) e AnamorphicNode (CA, exposure, bloom, halation,
> grade filmico, grana, vignette ovale, flare con auto-detect hotspot CPU) —
> Chain Lab ora monta il rack completo di 5 nodi, 13/13 check pixel-level passati.
> **Grafo-cervello funzionale ✅**: trascinare un nodo-hub su un altro nel grafo
> della home crea la catena (drag = link, click = apre l'effetto); la catena è
> disegnata in oro con frecce di direzione, persiste in localStorage, e "Open
> Chain Lab" la apre con i nodi collegati abilitati nell'ordine del grafo —
> verificato end-to-end (7/7 check).
> **Audio-reactive nativo ✅ (matrice §4.4)**: `AudioEngine` (mic → bande
> bass/loud/treble + beat detection con envelope e stima BPM) e `ParamBus`
> (valore finale = base manuale + amount × segnale × range, basi separate dalla
> modulazione). Nel Chain Lab: pulsante AUDIO IN con meter live, e su ogni
> parametro reactive un chip `~` che cicla off/bass/loud/treble/beat con slider
> amount ±1 e readout modulato — verificato con WAV sintetico a 120 BPM come
> mic finto (6/6 check).
> **Video-reactive nativo ✅ + preset della catena ✅**: `VideoAnalyzer`
> (frame-diff luma su griglia 80×45 → segnale MOTION 0..1 + BRIGHTNESS) — il
> chip `~` ora cicla su tutte e 6 le sorgenti (bass/loud/treble/beat/motion/
> bright), meter motion/bright live con sorgente attiva. Preset della catena in
> localStorage (decisione #9): salvano l'intero rack — ordine nodi, bypass,
> basi numeriche, booleani e route di modulazione — con load in place e
> persistenza al reload (15/15 check; requisito preset della DoD §11 coperto
> anche per la catena nativa).
> **Gemini pilota la catena nativa ✅**: AI Optimizer nel Chain Lab — l'intero
> rack esposto come ParamSchema namespaced (`nodeId.param` + interruttori
> `nodeId.enabled`) a `/api/gemini/optimize`, preset applicato via ParamBus.
> **Pannelli 3D nativi ✅**: modalità PANELS del tracker in WebGL2 puro (quad
> prospettici con turbolenza su sfondo attenuato — panelScale/Turbulence/CamZ/
> BgOpacity, chiavi come lo standalone). **Maschera persona nei nodi ✅ (hook)**:
> servizio `PersonMask` condiviso (MediaPipe selfie segmentation lazy da CDN,
> 10 Hz) → SEGMENTATION su Bokeh (soggetto nitido) e Blob Reveal (rotoscope);
> degradazione controllata verificata al pixel (output identico senza maschera,
> stato SEG: READY/LOADING/UNAVAILABLE nel Chain Lab) — 13/13 check +
> regressione completa 41/41.
> **Fase 6 (in corso, 4/5)**: **MediaPipe vendorizzato ✅** (tasks-vision +
> wasm SIMD + selfie_segmenter in repo, ~9.6 MB — la segmentazione raggiunge
> READY senza rete, local-first con fallback CDN, e il modello reale è ora
> esercitato nella verifica: maschera vuota su footage non-persona).
> **Risoluzione adattiva ✅** (§6.4: 100→75→50% con isteresi sotto budget,
> indicatore RES nel Chain Lab, export Master sempre a risoluzione nativa).
> **Design token ✅** (decisione #3: `--syn-*` su :root alimenta scala Tailwind,
> glow e grafo canvas — re-skin verificato ricolorando l'app in blu a runtime).
> **Segnaposto nav ✅** (Save = snapshot sessione ripristinato al boot;
> Projects = elenco catene salvate aperte direttamente nel Chain Lab; Contact
> rimosso). Verifica: 11/11 nuovi check + regressione totale 54/54.
> Resta: QA cross-browser Safari/Firefox (non eseguibile nell'ambiente di
> verifica, solo Chromium disponibile) e la definizione della terza estetica
> (decisione di State — ora è una sostituzione del blocco token).

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
- [x] MVP catena: **2 effetti in serie** a 60 fps @ 1080p (es. Blob Tracker → Analog).
- [x] UI di chaining coerente col "cervello": nel grafo home, **collegare due nodi = creare
      la catena** (l'identità Obsidian diventa funzionale, non solo estetica).
- [x] Porting dei restanti effetti come nodi (Blob Reveal, Bokeh, Anamorphic Lab); la
      versione iframe resta il fallback finché ogni port non è alla pari (mancano ancora:
      maschera MediaPipe, pannelli 3D, audio-reactive nativo).

### Fase 6 — Estetica finale, performance, rifinitura

- [x] Design token CSS (`--syn-bg`, `--syn-accent`, font slot…) su tutta la UI, grafo canvas
      incluso — il re-skin è una sostituzione di variabili, verificata a runtime. La **terza
      estetica** (decisione #3) resta da definire con State: ora è uno swap del blocco token.
- [x] Performance pass (§6.4): risoluzione interna adattiva 100→75→50% con isteresi e
      indicatore RES; l'export Master resta sempre a risoluzione nativa. (Target 60 fps @
      1080p da validare su hardware di riferimento con GPU reale.)
- [x] Vendoring delle dipendenze CDN dentro la repo: three.js (già fatto) + MediaPipe
      tasks-vision/wasm/modello (~9.6 MB) — segmentazione funzionante offline, CDN come
      fallback.
- [ ] QA cross-browser (Chrome/Edge → Safari/Firefox), gestione permessi negati, empty state
      (permessi/empty state già coperti nel Chain Lab; Safari/Firefox da provare a mano).
- [x] Pulizia voci segnaposto: Save = snapshot di sessione (ripristinato al boot),
      Projects = catene salvate aperte nel Chain Lab, Contact rimosso.

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
| **Audio da file** ✅ | Reattività su una traccia musicale caricata (non solo mic) — fondamentale per music video. *Fatto: `AudioEngine.startFile` con trasporto play/pause/seek/loop nel Chain Lab, bande e beat condivisi col mic (8/8 check).* | Basso |
| **BPM / tap tempo** | Pulsazioni degli effetti sincronizzate al tempo del brano *(la stima BPM dal beat detection esiste già; manca il tap-tempo manuale)* | Basso |
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
