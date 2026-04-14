export const CHAT_ATTACHMENT_ACCEPT = "image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isSupportedChatAttachmentMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) {
    return false;
  }
  const mime = mimeType.toLowerCase();
  // Support images
  if (mime.startsWith("image/")) {
    return true;
  }
  // Support Word documents
  if (
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-word" ||
    mime.includes("wordprocessingml")
  ) {
    return true;
  }
  return false;
}
