const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

// Configure multer for memory storage to process the image before saving
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const resizeAndSave = (targetDir, prefix, maxDim = 800) => {
  return async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    const filename = `${prefix}-${Date.now()}.webp`;
    const outputPath = path.join(targetDir, filename);

    try {
      await sharp(req.file.buffer)
        .resize(maxDim, maxDim, {
          fit: sharp.fit.inside,
          withoutEnlargement: true,
        })
        .toFormat('webp', { quality: 80 })
        .toFile(outputPath);

      // Attach the new filename to the request body for the controller
      req.body.imageFilename = filename;
      next();
    } catch (error) {
      console.error('Image processing error:', error);
      next(error);
    }
  };
};

module.exports = {
  upload,
  resizeAndSave,
};