import { useMutation } from '@tanstack/react-query'
import { uploadMediaFile } from '../api/upload'

export function useUpload(userId: string) {
  return useMutation({
    mutationFn: (file: File) => uploadMediaFile(file, userId),
  })
}
