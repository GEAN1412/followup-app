import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to check for required env vars
function checkCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('CLOUDINARY CONFIG ERROR: Missing environment variables.');
    return false;
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  return true;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Configure multer for memory storage
  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  // API Route for Cloudinary Upload
  app.post('/api/upload', upload.single('screenshot'), async (req: any, res: any) => {
    try {
      if (!checkCloudinaryConfig()) {
        throw new Error('Cloudinary not configured on server. Check environment variables.');
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { date, pic } = req.body;
      if (!date || !pic) {
        return res.status(400).json({ error: 'Missing date or PIC' });
      }

      // Parse date to get month and year for folder
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      const folderName = `${month}-${year}`;
      const fileName = `${day}${year}-${pic.replace(/\s+/g, '_').toLowerCase()}-${Date.now()}`;

      // Upload to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `laundry_followups/${folderName}`,
            public_id: fileName,
            resource_type: 'auto'
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary Upload Stream Error:', error);
              reject(error);
            }
            else resolve(result);
          }
        );
        uploadStream.end(req.file!.buffer);
      });

      res.json({ 
        url: (result as any).secure_url,
        public_id: (result as any).public_id 
      });
    } catch (error: any) {
      console.error('Upload handler error:', error);
      res.status(500).json({ error: error.message || 'Upload failed' });
    }
  });

  // API Route to Delete Image from Cloudinary
  app.post('/api/delete-image', async (req: any, res: any) => {
    try {
      if (!checkCloudinaryConfig()) {
        throw new Error('Cloudinary not configured.');
      }

      const { screenshotUrl } = req.body;
      if (!screenshotUrl) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Extract public_id from Cloudinary URL
      // Pattern: .../upload/v12345678/folder/public_id.ext
      const parts = screenshotUrl.split('/');
      const lastPart = parts.pop() || '';
      const publicIdWithExt = lastPart.split('.')[0];
      
      // We need the full path including folders
      // Find the index of 'upload' and get everything after the version segment
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) throw new Error('Invalid Cloudinary URL');
      
      // The structure is usually /upload/v12345/folder/id
      // We skip 'upload' and the version (v...)
      const pathParts = parts.slice(uploadIndex + 2); 
      const publicId = [...pathParts, publicIdWithExt].join('/');

      console.log('Deleting Cloudinary image:', publicId);
      const result = await cloudinary.uploader.destroy(publicId);
      
      res.json({ result: result.result });
    } catch (error: any) {
      console.error('Delete image error:', error);
      res.status(500).json({ error: error.message || 'Delete failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
