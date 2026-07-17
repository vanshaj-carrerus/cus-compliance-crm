declare module "exceljs/dist/exceljs.min.js" {
  const ExcelJS: {
    Workbook: new () => {
      creator: string;
      created: Date;
      modified: Date;
      addWorksheet: (
        name: string,
        opts?: { views?: Array<{ state: string; ySplit: number }> }
      ) => unknown;
      xlsx: {
        writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
        load: (data: ArrayBuffer) => Promise<unknown>;
      };
      getWorksheet: (name: string) => unknown;
    };
  };
  export default ExcelJS;
}
