const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");

const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName: "images" });
};

const validateImage = (buffer, contentType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024) return false;
  if (contentType === "image/png") return buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (contentType === "image/jpeg") return buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (contentType === "image/gif") return buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6));
  return false;
};

const storeImage = ({ buffer, filename, contentType }) =>
  new Promise((resolve, reject) => {
    if (!validateImage(buffer, contentType)) {
      return reject(new Error("Invalid image content."));
    }
    const uploadStream = getBucket().openUploadStream(filename, {
      contentType,
      metadata: { kind: "application-image" },
    });

    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });

const getImage = async (fileId) => {
  if (!fileId || !ObjectId.isValid(String(fileId))) {
    return null;
  }

  return mongoose.connection.db
    .collection("images.files")
    .findOne({ _id: new ObjectId(String(fileId)) });
};

const streamImage = (fileId, res) => {
  if (!fileId || !ObjectId.isValid(String(fileId))) {
    return false;
  }

  getBucket()
    .openDownloadStream(new ObjectId(String(fileId)))
    .on("error", () => {
      if (!res.headersSent) res.status(404).end();
    })
    .pipe(res);
  return true;
};

const deleteImage = async (fileId) => {
  if (!fileId || !ObjectId.isValid(String(fileId))) {
    return false;
  }

  try {
    await getBucket().delete(new ObjectId(String(fileId)));
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === 26) return false;
    throw error;
  }
};

module.exports = { validateImage, storeImage, getImage, streamImage, deleteImage };
