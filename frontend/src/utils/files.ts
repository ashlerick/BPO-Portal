// Reads a File as a bare base64 string (no data: prefix), the shape the
// upload endpoints expect. The backend caps uploads at 4MB.
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
