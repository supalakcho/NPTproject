// รับไฟล์รูป field "image" (jpg/png/webp ≤ 2 MB) เก็บที่ UPLOAD_DIR/<folder> แล้วส่ง path ให้ service
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * @param {'avatars'|'models'} folder
 * @returns {import('express').RequestHandler} ใส่ req.file และ req.uploadPath (เช่น 'uploads/models/abc.webp')
 */
export function uploadImage(folder) {
  const dir = path.join(UPLOAD_DIR, folder);
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir)),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (TYPES[file.mimetype]) return cb(null, true);
      return cb(Object.assign(new Error('invalid file type'), { code: 'INVALID_FILE' }));
    },
  }).single('image');

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (err) return next(err);
      if (!req.file) return next(Object.assign(new Error('no file'), { code: 'INVALID_FILE' }));
      req.uploadPath = `uploads/${folder}/${req.file.filename}`;
      return next();
    });
}

/** ลบไฟล์ที่อัปโหลดเมื่อ service ปฏิเสธ (ไม่ throw) */
export function discardUpload(req) {
  if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {});
}
