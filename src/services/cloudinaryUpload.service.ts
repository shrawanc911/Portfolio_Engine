import cloudinary from "../config/cloudinary";

function safePublicId(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function uploadBase64ToCloudinary(
  contentType: string,
  base64: string,
  displayName: string
) {
  const dataURI = `data:${contentType};base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataURI, {
    folder: "stocks",
    public_id: safePublicId(displayName),
    overwrite: true,
    quality: "auto",
    fetch_format: "auto",
  });

  return result.secure_url;
}
