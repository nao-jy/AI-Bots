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
