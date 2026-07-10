import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Google Gen AI with named key configuration and proper telemetry headers
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// AI Oracle endpoint for multi-turn conversational intelligence
app.post("/api/gemini/chat", async (req, res) => {
  const { message, history, currentConfig } = req.body;
  const activeModuleId = currentConfig?.activeModule || "BLOB";

  try {
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Build model prompt context incorporating current active module and visual signal parameters
    const systemInstruction = `You are the VFX Syntech AI Vault Oracle, an intelligence node embedded in an Obsidian Constellation Vault. You have supreme expertise in high-fidelity digital and analog visual effects synthesis, frequency spectrum dynamics, and generative particles.

Your design matches the elegant, premium Obsidian gold-and-black aesthetic. 

When the user queries, you must help them:
1. Customize and optimize visual effect parameters (Vertex Displacement, CRT Emulation, Quantum Gravity, Input Sensitivity, etc.).
2. Generate creative presets or mathematical visual concepts.
3. Understand connections in the Obsidian graph.

CURRENT LIVE VFX CONFIGURATION:
- Active Module: ${activeModuleId}
- Signal Source: ${currentConfig?.signalSource || "unknown"}
- Buffer Size: ${currentConfig?.bufferSize || "unknown"}
- Parameters: ${JSON.stringify(currentConfig?.parameters || {})}

FORMAT RULES:
- Use elegant, clean markdown.
- Maintain a high-tech, precise scientific, slightly poetic tone.
- Keep responses concise, scannable, and highly relevant.
- IMPORTANT: If you suggest changes to parameters, format them nicely. If you suggest specific values for the current active module, you can optionally include a line with JSON formatting like: \`PRESET:{"displacement":80,"fluidDynamics":45}\` (substituting parameter keys) so the user can apply them instantly!`;

    // Map message history to standard GenAI parts format
    const formattedContents = [
      ...(history || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      })),
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    // Generate response using gemini-3.5-flash
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.75,
      }
    });

    const replyText = response.text || "I was unable to retrieve a response from the neural nodes.";
    
    // Check if replyText contains a parameter preset suggestion
    let presetMatch = replyText.match(/PRESET:({.*?})/);
    let extractedPreset = null;
    if (presetMatch) {
      try {
        extractedPreset = JSON.parse(presetMatch[1]);
      } catch (err) {
        // ignore malformed suggestion JSON
      }
    }

    res.json({
      reply: replyText,
      preset: extractedPreset
    });

  } catch (error: any) {
    // Elegant local fallback sequence when upstream is busy, rate-limited, or unconfigured
    
    // Create intelligent offline responses when the API is overloaded/503/key is missing
    let fallbackReply = "The primary Gemini cognitive stream is currently experiencing high request queues or is temporarily unavailable. Local Obsidian Vault archives remain active.\n\n";
    let extractedPreset: any = null;

    if (activeModuleId === "blob_tracker") {
      fallbackReply += "As requested, local sensors suggest boosting **Displacement** to 85% and **Fluid Dynamics** to 75% for dramatic, organic canvas deformation.\n\nPRESET:{\"displacement\":85,\"fluidDynamics\":75,\"cellSize\":35}";
      extractedPreset = { displacement: 85, fluidDynamics: 75, cellSize: 35 };
    } else if (activeModuleId === "analog") {
      fallbackReply += "Local scanlines report optimal **Analog** settings: Raise **CRT Emulation** to 80% to bring out phosphor grids, with **Chromatic Aberration** at 65% for retro distortion.\n\nPRESET:{\"crtEmulation\":80,\"syncJitter\":45,\"chromaticAberration\":65}";
      extractedPreset = { crtEmulation: 80, syncJitter: 45, chromaticAberration: 65 };
    } else if (activeModuleId === "blob_reveal") {
      fallbackReply += "Local sensors suggest boosting **Reveal Threshold** to 70% and **Edge Feather** to 60% for a highly cinematic reveal matrix.\n\nPRESET:{\"revealThreshold\":70,\"maskInversion\":30,\"edgeFeather\":60}";
      extractedPreset = { revealThreshold: 70, maskInversion: 30, edgeFeather: 60 };
    } else if (activeModuleId === "bokeh") {
      fallbackReply += "Local lens calculations recommend raising **Depth of Field** to 75% and **Bokeh Radius** to 65% for heavy background blur aesthetics.\n\nPRESET:{\"depthOfField\":75,\"bokehScale\":65,\"apertureShutter\":45}";
      extractedPreset = { depthOfField: 75, bokehScale: 65, apertureShutter: 45 };
    } else {
      fallbackReply += "Anamorphic Lab local calculations suggest increasing **Streak Intensity** to 85% and **Flare Stretching** to 90% for majestic horizontal flares.\n\nPRESET:{\"streakIntensity\":85,\"flareStretching\":90,\"diffractionGrating\":40}";
      extractedPreset = { streakIntensity: 85, flareStretching: 90, diffractionGrating: 40 };
    }

    res.json({
      reply: fallbackReply,
      preset: extractedPreset,
      isFallback: true,
      info: "Loaded vault offline archives due to upstream API limits."
    });
  }
});

// Gemini Intelligence Parameter Optimizer endpoint
app.post("/api/gemini/optimize", async (req, res) => {
  const { activeModule, parameters, prompt } = req.body;
  
  try {
    let systemInstruction = `You are the VFX Syntech Gemini Optimizer.
Your job is to analyze the active module and its parameters, and return a set of optimized parameter values that would make the visuals extremely high-fidelity, dramatic, and aesthetically stunning.

Return ONLY a valid JSON object mapping the parameter keys to their recommended percentage values (numbers between 0 and 100). Do not write any other text, markdown, or code blocks. Just the raw JSON.

Examples for BLOB STATE TRACKER (keys: displacement, fluidDynamics, cellSize):
{"displacement":85,"fluidDynamics":70,"cellSize":35}

Examples for ANALOG STATE (keys: crtEmulation, syncJitter, chromaticAberration):
{"crtEmulation":75,"syncJitter":40,"chromaticAberration":60}

Examples for PARTICLE HARMONICS (keys: speed, gravity, spread):
{"speed":80,"gravity":30,"spread":75}

Examples for SPECTRUM ANALYZER (keys: sensitivity, decay, resolution):
{"sensitivity":90,"decay":35,"resolution":80}

ACTIVE MODULE: ${activeModule}
CURRENT PARAMETERS: ${JSON.stringify(parameters)}`;

    if (prompt && prompt.trim()) {
      systemInstruction += `\n\nCRITICAL USER DIRECTION: The operator has requested the following visual theme/guideline: "${prompt}". You MUST calibrate the parameters strictly to match this style.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: "Generate the optimized parameter JSON" }] }],
      config: {
        systemInstruction,
        temperature: 0.4,
        responseMimeType: "application/json"
      }
    });

    const replyText = response.text?.trim() || "{}";
    const cleanedJson = replyText.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleanedJson);

    res.json({ preset: result });
  } catch (error: any) {
    // Mathematical local fallback calibration when upstream is busy, rate-limited, or unconfigured
    
    // Provide beautifully optimized fallback defaults so the button still works instantly
    let fallbackPreset: Record<string, number> = {};
    if (activeModule === "blob_tracker") {
      fallbackPreset = { displacement: 85, fluidDynamics: 70, cellSize: 30 };
    } else if (activeModule === "analog") {
      fallbackPreset = { crtEmulation: 80, syncJitter: 45, chromaticAberration: 65 };
    } else if (activeModule === "blob_reveal") {
      fallbackPreset = { revealThreshold: 70, maskInversion: 30, edgeFeather: 60 };
    } else if (activeModule === "bokeh") {
      fallbackPreset = { depthOfField: 75, bokehScale: 65, apertureShutter: 45 };
    } else {
      fallbackPreset = { streakIntensity: 85, flareStretching: 90, diffractionGrating: 40 };
    }

    res.json({ 
      preset: fallbackPreset,
      isFallback: true,
      message: "Upstream busy. Loaded mathematical vault optimal presets."
    });
  }
});

// Gemini Intelligence live aesthetic analyzer critique endpoint
app.post("/api/gemini/analyze", async (req, res) => {
  const { activeModule, parameters, prompt } = req.body;

  try {
    let systemInstruction = `You are the VFX Syntech AI Art Director.
Generate a highly atmospheric, sci-fi poetic, and technically advanced 2-sentence aesthetic analysis or design inspiration for the current active VFX module "${activeModule}" with parameters ${JSON.stringify(parameters)}.
Describe what the wave forms and particles are expressing. Keep it elegant, dramatic, under 45 words, and strictly relevant. No greetings or meta text.`;

    if (prompt && prompt.trim()) {
      systemInstruction += `\n\nUSER DIRECTION / FOCUS: The operator has requested you to focus on or incorporate the following idea: "${prompt}". Tailor your aesthetic analysis or design inspiration around this context.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: "Perform live canvas aesthetic critique" }] }],
      config: {
        systemInstruction,
        temperature: 0.85,
      }
    });

    res.json({ analysis: response.text?.trim() || "Obsidian nodes align. The stream spectrum is clean." });
  } catch (error: any) {
    // Sci-fi aesthetic backup telemetry generator when upstream is busy, rate-limited, or unconfigured

    // Provide pre-designed beautiful sci-fi critiques specific to the active module
    let fallbackAnalysis = "Obsidian nodes detect active force fields. Visual resonance aligns within high-fidelity tolerances.";
    
    if (activeModule === "blob_tracker") {
      fallbackAnalysis = "Resonant amorphous particles expand outwards, translating dynamic sound pressure waves into beautiful fluid membranes.";
    } else if (activeModule === "analog") {
      fallbackAnalysis = "Phosphor scanlines trace retro waveforms. Minor clock deviations form elegant noise fields with warm chromatic refractions.";
    } else if (activeModule === "blob_reveal") {
      fallbackAnalysis = "A soft negative luminance mask gradually expands outward, peeling back layer after layer of glowing digital blueprints.";
    } else if (activeModule === "bokeh") {
      fallbackAnalysis = "A heavy circular lens aberration field scatters the background nodes, forming beautiful out-of-focus overlapping disks.";
    } else if (activeModule === "anamorphic_lab") {
      fallbackAnalysis = "A majestic horizontal streak projection expands across the ultra-wide lens boundary, creating elegant cinematic flares.";
    }

    res.json({ 
      analysis: fallbackAnalysis,
      isFallback: true,
      message: "Showing local sensor telemetry."
    });
  }
});

// Configure Vite middleware or static route handling depending on production state
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT} // Full-stack core ready.`);
  });
};

startServer();
