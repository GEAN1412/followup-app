import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Configure Cloudinary
function checkCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return false;
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  return true;
}

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

    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const folderName = `${month}-${year}`;
    const fileName = `${day}${year}-${pic.replace(/\s+/g, '_').toLowerCase()}-${Date.now()}`;

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `laundry_followups/${folderName}`,
          public_id: fileName,
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
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

    const parts = screenshotUrl.split('/');
    const lastPart = parts.pop() || '';
    const publicIdWithExt = lastPart.split('.')[0];
    
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) throw new Error('Invalid Cloudinary URL');
    
    const pathParts = parts.slice(uploadIndex + 2); 
    const publicId = [...pathParts, publicIdWithExt].join('/');

    const result = await cloudinary.uploader.destroy(publicId);
    res.json({ result: result.result });
  } catch (error: any) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

export default app;
