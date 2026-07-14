import * as zlib from 'zlib';

export type XlsxValue = string | number | boolean | Date | null | undefined;

export type XlsxRow = {
  values: XlsxValue[];
  style?: number;
};

export type WorkbookSheet = {
  name: string;
  rows: XlsxRow[];
};

type ZipInputFile = {
  path: string;
  content: string | Buffer;
};

type ZipEntry = {
  path: string;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressedData: Buffer;
};

const MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function buildWorkbookXlsxBase64(sheets: WorkbookSheet[]) {
  const normalizedSheets = normalizeSheets(sheets);

  const files: ZipInputFile[] = [
    {
      path: '[Content_Types].xml',
      content: contentTypesXml(normalizedSheets.length),
    },
    {
      path: '_rels/.rels',
      content: rootRelsXml(),
    },
    {
      path: 'xl/workbook.xml',
      content: workbookXml(normalizedSheets),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: workbookRelsXml(normalizedSheets.length),
    },
    {
      path: 'xl/styles.xml',
      content: stylesXml(),
    },
    ...normalizedSheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet),
    })),
  ];

  return {
    mimeType: MIME_TYPE,
    contentBase64: buildZip(files).toString('base64'),
  };
}

function normalizeSheets(sheets: WorkbookSheet[]) {
  const source = sheets.length
    ? sheets
    : [
        {
          name: 'Sheet1',
          rows: [{ values: ['No data'] }],
        },
      ];

  const used = new Set<string>();

  return source.map((sheet, index) => {
    let name = sanitizeSheetName(sheet.name || `Sheet${index + 1}`);

    if (!name) {
      name = `Sheet${index + 1}`;
    }

    let candidate = name;
    let counter = 2;

    while (used.has(candidate.toLowerCase())) {
      const suffix = ` ${counter}`;
      candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }

    used.add(candidate.toLowerCase());

    return {
      name: candidate,
      rows: sheet.rows.length ? sheet.rows : [{ values: ['No data'] }],
    };
  });
}

function sanitizeSheetName(value: string) {
  return value
    .replace(/[\[\]\*\/\\\?\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
}

function contentTypesXml(sheetCount: number) {
  const worksheetOverrides = Array.from({ length: sheetCount })
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  return xmlDeclaration(`
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${worksheetOverrides}
</Types>`);
}

function rootRelsXml() {
  return xmlDeclaration(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
}

function workbookXml(sheets: WorkbookSheet[]) {
  const sheetXml = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');

  return xmlDeclaration(`
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`);
}

function workbookRelsXml(sheetCount: number) {
  const worksheetRels = Array.from({ length: sheetCount })
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');

  return xmlDeclaration(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${worksheetRels}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function stylesXml() {
  return xmlDeclaration(`
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function worksheetXml(sheet: WorkbookSheet) {
  const maxColumns = Math.max(
    1,
    ...sheet.rows.map((row) => row.values.length || 1),
  );

  const columns = Array.from({ length: maxColumns })
    .map((_, index) => {
      const width = index === 0 ? 22 : index === 1 ? 36 : 18;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;

      const cells = row.values
        .map((value, colIndex) => cellXml(value, rowNumber, colIndex + 1, row.style))
        .filter(Boolean)
        .join('');

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');

  return xmlDeclaration(`
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columns}</cols>
  <sheetData>${rows}</sheetData>
</worksheet>`);
}

function cellXml(value: XlsxValue, row: number, col: number, style?: number) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const reference = `${columnName(col)}${row}`;
  const styleAttribute = style !== undefined ? ` s="${style}"` : '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  }

  if (typeof value === 'boolean') {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text,
  )}</t></is></c>`;
}

function columnName(col: number) {
  let name = '';
  let current = col;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function xmlDeclaration(xml: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xml.trim()}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildZip(files: ZipInputFile[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const entries: ZipEntry[] = [];

  let offset = 0;

  for (const file of files) {
    const data = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, 'utf8');

    const compressedData = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const fileName = Buffer.from(file.path, 'utf8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileName, compressedData);

    entries.push({
      path: file.path,
      crc,
      compressedSize: compressedData.length,
      uncompressedSize: data.length,
      localHeaderOffset: offset,
      compressedData,
    });

    offset += localHeader.length + fileName.length + compressedData.length;
  }

  let centralDirectorySize = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.path, 'utf8');
    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);

    centralParts.push(centralHeader, fileName);
    centralDirectorySize += centralHeader.length + fileName.length;
  }

  const centralDirectoryOffset = offset;

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}

const CRC_TABLE = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
