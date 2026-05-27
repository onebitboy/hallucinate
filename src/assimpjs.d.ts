declare module 'assimpjs' {
  type AssimpFile = {
    GetContent(): Uint8Array
  }

  type AssimpResult = {
    IsSuccess(): boolean
    FileCount(): number
    GetErrorCode(): number
    GetFile(index: number): AssimpFile
  }

  type AssimpFileList = {
    AddFile(name: string, content: Uint8Array): void
  }

  type AssimpModule = {
    FileList: new() => AssimpFileList
    ConvertFileList(files: AssimpFileList, format: string): AssimpResult
  }

  type AssimpOptions = {
    locateFile?(path: string): string
  }

  export default function assimpjs(options?: AssimpOptions): Promise<AssimpModule>
}
