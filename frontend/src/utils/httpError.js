/** Decode bounded JSON blob errors while preserving status, code and native error identity. */
export async function normalizeHttpError(error) {
  const data = error?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob && data.size <= 65536) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) error.response.data = parsed;
      else error.response.data = { message: 'Download failed. Please try again.' };
    } catch { error.response.data = { message: 'Download failed. Please try again.' }; }
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    error.response.data = { message: 'Download failed. Please try again.' };
  }
  return error;
}
