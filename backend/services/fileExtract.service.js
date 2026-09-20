'use strict';

const JSZip = require('jszip');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const { normalizeSpace } = require('../utils/text');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Every extractor takes the raw upload buffer and returns plain text. None
 * of them touch the filesystem: the buffer is parsed in memory and dropped
 * as soon as the request finishes, so nothing about the file persists.
 */

async function fromTxt(buffer) {
  return buffer.toString('utf8');
}

async function fromPdf(buffer) {
  const result = await pdfParse(buffer);
  return result.text || '';
}

async function fromDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function fromSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    // sheet_to_csv keeps each row on its own line and each cell readable,
    // which is close enough to prose for the difficult-word extractor.
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `${name}\n${csv}`;
  }).join('\n\n');
}

/**
 * A .pptx is a zip of XML slide parts. Each run of text on a slide sits
 * inside an <a:t> tag, so pulling those out (in slide order) reconstructs
 * a readable transcript without needing a full XML parser.
 */
async function fromPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const numOf = (path) => Number.parseInt(path.match(/slide(\d+)\.xml$/)[1], 10);
      return numOf(a) - numOf(b);
    });

  const slides = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('string');
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]);
    const text = runs.join(' ').trim();
    if (text) slides.push(text);
  }

  return slides.join('\n\n');
}

const EXTRACTORS = {
  '.txt': fromTxt,
  '.md': fromTxt,
  '.pdf': fromPdf,
  '.docx': fromDocx,
  '.xlsx': fromSpreadsheet,
  '.xls': fromSpreadsheet,
  '.pptx': fromPptx
};

async function extractText(buffer, ext) {
  const extractor = EXTRACTORS[ext];
  if (!extractor) {
    throw new ApiError(415, 'unsupported_file_type', 'That file type is not supported.');
  }

  let raw;
  try {
    raw = await extractor(buffer);
  } catch (error) {
    throw new ApiError(
      422,
      'extraction_failed',
      'The file could not be read. It may be corrupted, password-protected, or empty.'
    );
  }

  // Collapse to readable paragraphs: keep blank lines as paragraph breaks
  // (the reader view relies on them) but tidy up everything else.
  const text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => normalizeSpace(paragraph))
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!text) {
    throw new ApiError(422, 'no_text_found', 'No readable text was found in that file.');
  }

  return text;
}

module.exports = { extractText };
