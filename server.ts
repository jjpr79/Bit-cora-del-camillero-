import fs from 'fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  app.use(express.json());

  app.post('/api/ocr', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }



      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          { text: 'Look for "NOMBRES", "APELLIDOS", and "NUMERO" in this image of a Colombian ID. Output ONLY a valid JSON object: {"pacienteNombre": "...", "historiaClinica": "..."}. If not found, return empty strings.' },
          { 
            inlineData: { 
              mimeType: req.file.mimetype, 
              data: req.file.buffer.toString('base64') 
            } 
          }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '{}';
      fs.writeFileSync('ocr_debug.log', `Request: ${new Date().toISOString()}\nResponse: ${responseText}\n`, { flag: 'a' });
      
      // Limpieza exhaustiva
      let cleanedText = responseText.trim();
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      
      if (!cleanedText) {
        throw new Error('Empty response from model');
      }

      const result = JSON.parse(cleanedText);
      res.json(result);
    } catch (err) {
      fs.writeFileSync('ocr_debug.log', `Error: ${new Date().toISOString()}\n${err instanceof Error ? err.message : String(err)}\n`, { flag: 'a' });
      res.status(500).json({ error: 'OCR processing failed', details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use(vite.middlewares);

  const server = app.listen(3000, () => console.log('Server running on port 3000'));
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.log('Port 3000 busy, trying again in 1s...');
      setTimeout(() => {
        server.close();
        app.listen(3000, () => console.log('Server running on port 3000'));
      }, 1000);
    }
  });
}

startServer();
