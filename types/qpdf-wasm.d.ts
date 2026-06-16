declare module "qpdf-wasm" {
  type QpdfFileSystem = {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };

  type QpdfModule = {
    FS: QpdfFileSystem;
    callMain(args: string[]): void;
  };

  export default function init(options?: {
    locateFile?: (path: string, prefix?: string) => string;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }): Promise<QpdfModule>;
}
