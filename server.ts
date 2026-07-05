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
  try {
    const { message, history, currentConfig } = req.body;

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
- Active Module: ${currentConfig?.activeModule || "unknown"}
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
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during neural inference." });
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
