import multer from "multer";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { isAllowedUpload, MAX_FILE_SIZE } from "../lib/fileTypes.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split(".").pop();
    cb(null, `cdsi_${uuidv4()}${ext ? "." + ext : ""}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}`));
    }
  },
});
