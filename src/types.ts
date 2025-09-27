export interface PdfConfig {
  extractMetadata?: boolean;
  extractImages?: boolean;
  includePageInfo?: boolean;
  outputFormat?: 'text' | 'markdown' | 'html' | 'json';
  safetyChecks?: boolean;
  maxPages?: number;
  password?: string;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date | null;
  modificationDate?: Date | null;
  keywords?: string;
  pageCount?: number;
  encrypted?: boolean;
}

export interface PageInfo {
  pageNumber: number;
  width?: number;
  height?: number;
  rotation?: number;
  content: string;
  images?: Buffer[];
}

export interface PdfData {
  text: string;
  pages?: PageInfo[];
  metadata?: PdfMetadata;
  images?: Buffer[];
  totalPages: number;
}

export interface ProcessingResult {
  success: boolean;
  data?: PdfData;
  metadata?: PdfMetadata;
  warnings?: string[];
  errors?: string[];
  processingTime?: number;
}

export interface SafetyResult {
  isSafe: boolean;
  issues: string[];
  hash: string;
  fileSize: number;
}

export interface ConversionOptions {
  inputPath: string;
  outputPath?: string;
  format: 'text' | 'markdown' | 'html' | 'json';
  config?: PdfConfig;
  pages?: string; // e.g., "1,3,5-10"
}

export interface SplitOptions {
  pages?: string;
  outputDir?: string;
  prefix?: string;
}

export interface MergeOptions {
  inputs: string[];
  output: string;
  bookmarks?: boolean;
}