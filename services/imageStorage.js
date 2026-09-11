const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");

const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName: "images" });
};

const storeImage = ({ buffer, filename, contentType }) =>
  new Promise((resolve, reject) => {
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

module.exports = { storeImage, getImage, streamImage, deleteImage };
