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

// Styled so the native file picker reads clearly on both themes.
export const FILE_INPUT_CLASS =
  'block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-brand-600/40 file:bg-brand-600/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-600/20 dark:file:border-brand-400/40 dark:file:text-brand-300'
