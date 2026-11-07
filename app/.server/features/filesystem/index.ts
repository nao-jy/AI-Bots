export interface FileEntry {
  // relative path
  path: string;
  // size byte
  size: number;
  updatedAt: Date;
}

export interface FileSystem {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<boolean>;
  list(prefix: string): Promise<FileEntry[]>;
  rename?(from: string, to: string): Promise<void>;
}

export interface BinaryFileSystem extends FileSystem {
  readBytes(path: string): Promise<Buffer | null>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
}
