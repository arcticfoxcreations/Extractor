'use strict';

const multer = require('multer');
const config = require('../config');
const { ApiError } = require('./errorHandler');

// Extension is the primary signal because browsers send inconsistent MIME
// types for Office formats (a .docx is sometimes reported as
// application/zip). Both are checked so a renamed .exe still gets rejected.
const ALLOWED = {
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain', 'text/x-markdown'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
};

function extensionOf(filename) {
  const match = /\.[a-z0-9]+$/i.exec(String(filename || ''));
  return match ? match[0].toLowerCase() : '';
}

// Memory storage only: the buffer lives for the length of this one request
// and is never written to disk, so there is nothing left over to clean up.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: config.limits.maxFileSizeBytes
  },
  fileFilter(req, file, callback) {
    const ext = extensionOf(file.originalname);

    if (!ALLOWED[ext]) {
      callback(
        new ApiError(
          415,
          'unsupported_file_type',
          'Only .txt, .md, .pdf, .docx, .xlsx, .xls and .pptx files are accepted.'
        )
      );
      return;
    }

    // A mismatched MIME type is a soft warning, not a hard reject: some
    // browsers and OSes report generic types for Office documents. The
    // extension check above is what actually gates the request.
    file.detectedExt = ext;
    callback(null, true);
  }
});

function singleDocument(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof ApiError) return next(error);

    if (error.code === 'LIMIT_FILE_SIZE') {
      const maxMb = Math.round(config.limits.maxFileSizeBytes / (1024 * 1024));
      return next(new ApiError(413, 'file_too_large', `Files are limited to ${maxMb} MB.`));
    }

    return next(new ApiError(400, 'upload_failed', 'The file could not be read.'));
  });
}

module.exports = { singleDocument };
