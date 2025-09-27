import * as fs from 'fs';
const pdfParse = require('pdf-parse');
import { PdfConfig, PdfData, PdfMetadata, PageInfo, ProcessingResult } from './types';
import { SafetyManager } from './safety-manager';

export class PdfParser {
  private config: PdfConfig;
  private safetyManager: SafetyManager;

  constructor(config: PdfConfig = {}) {
    this.config = {
      extractMetadata: true,
      extractImages: false,
      includePageInfo: false,
      outputFormat: 'text',
      safetyChecks: true,
      ...config
    };
    
    this.safetyManager = new SafetyManager();
  }

  async parseFile(filePath: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    const result: ProcessingResult = {
      success: false,
      warnings: [],
      errors: []
    };

    try {
      // Safety validation
      if (this.config.safetyChecks) {
        const safetyResult = await this.safetyManager.validateFile(filePath);
        if (!safetyResult.isSafe) {
          result.errors = safetyResult.issues;
          return result;
        }
      }

      const pdfBuffer = fs.readFileSync(filePath);
      const options: any = {};
      
      if (this.config.password) {
        options.password = this.config.password;
      }
      
      if (this.config.maxPages) {
        options.max = this.config.maxPages;
      }

      const pdfData = await pdfParse(pdfBuffer, options);
      
      const parsedData: PdfData = {
        text: pdfData.text,
        totalPages: pdfData.numpages
      };

      // Extract metadata
      if (this.config.extractMetadata && pdfData.info) {
        const metadata = this.extractMetadata(pdfData.info);
        if (metadata) {
          parsedData.metadata = metadata;
        }
      }

      // Extract page info if requested
      if (this.config.includePageInfo) {
        parsedData.pages = await this.extractPageInfo(pdfBuffer, pdfData);
      }

      result.data = parsedData;
      if (parsedData.metadata) {
        result.metadata = parsedData.metadata;
      }
      result.success = true;
      result.processingTime = Date.now() - startTime;

    } catch (error) {
      result.errors?.push(`Parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private extractMetadata(info: any): PdfMetadata {
    const metadata: PdfMetadata = {};

    if (info.Title) metadata.title = info.Title;
    if (info.Author) metadata.author = info.Author;
    if (info.Subject) metadata.subject = info.Subject;
    if (info.Creator) metadata.creator = info.Creator;
    if (info.Producer) metadata.producer = info.Producer;
    if (info.Keywords) metadata.keywords = info.Keywords;
    
    if (info.CreationDate) {
      metadata.creationDate = this.parseDate(info.CreationDate);
    }
    
    if (info.ModDate) {
      metadata.modificationDate = this.parseDate(info.ModDate);
    }

    return metadata;
  }

  private parseDate(dateString: string): Date | null {
    try {
      // PDF dates can be in format: D:YYYYMMDDHHmmSSOHH'mm'
      if (dateString.startsWith('D:')) {
        const cleanDate = dateString.substring(2, 16); // YYYYMMDDHHMMSS
        const year = parseInt(cleanDate.substring(0, 4));
        const month = parseInt(cleanDate.substring(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(cleanDate.substring(6, 8));
        const hour = parseInt(cleanDate.substring(8, 10)) || 0;
        const minute = parseInt(cleanDate.substring(10, 12)) || 0;
        const second = parseInt(cleanDate.substring(12, 14)) || 0;
        
        return new Date(year, month, day, hour, minute, second);
      }
      
      // Try standard date parsing
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  private async extractPageInfo(_pdfBuffer: Buffer, pdfData: any): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];
    
    // Basic page splitting by form feeds or manual parsing
    const textPages = this.splitTextIntoPages(pdfData.text, pdfData.numpages);
    
    for (let i = 0; i < textPages.length; i++) {
      const page: PageInfo = {
        pageNumber: i + 1,
        content: textPages[i]
      };
      pages.push(page);
    }

    return pages;
  }

  private splitTextIntoPages(text: string, pageCount: number): string[] {
    // Simple heuristic to split text into pages
    if (pageCount === 1) {
      return [text];
    }

    // Try to split by form feed characters first
    const formFeedPages = text.split('\f');
    if (formFeedPages.length === pageCount) {
      return formFeedPages;
    }

    // Fallback: split by estimated length
    const avgLength = Math.ceil(text.length / pageCount);
    const pages: string[] = [];
    
    for (let i = 0; i < pageCount; i++) {
      const start = i * avgLength;
      const end = Math.min((i + 1) * avgLength, text.length);
      pages.push(text.slice(start, end));
    }

    return pages;
  }

  async convertToFormat(data: PdfData, format: string): Promise<string> {
    switch (format.toLowerCase()) {
      case 'markdown':
        return this.convertToMarkdown(data);
      case 'html':
        return this.convertToHtml(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'text':
      default:
        return data.text;
    }
  }

  private convertToMarkdown(data: PdfData): string {
    let markdown = '';

    if (data.metadata?.title) {
      markdown += `# ${data.metadata.title}\n\n`;
    }

    if (data.metadata?.author) {
      markdown += `**Author:** ${data.metadata.author}\n\n`;
    }

    if (data.metadata?.subject) {
      markdown += `**Subject:** ${data.metadata.subject}\n\n`;
    }

    // Convert text to markdown paragraphs
    const paragraphs = data.text
      .split(/\n\s*\n/)
      .filter(p => p.trim())
      .map(p => p.replace(/\n/g, ' ').trim());

    markdown += paragraphs.join('\n\n');

    if (data.pages) {
      markdown += '\n\n## Pages\n\n';
      data.pages.forEach(page => {
        markdown += `### Page ${page.pageNumber}\n\n`;
        const pageParas = page.content
          .split(/\n\s*\n/)
          .filter(p => p.trim())
          .map(p => p.replace(/\n/g, ' ').trim());
        markdown += pageParas.join('\n\n') + '\n\n';
      });
    }

    return markdown;
  }

  private convertToHtml(data: PdfData): string {
    let html = '<!DOCTYPE html>\n<html>\n<head>\n';
    html += '<meta charset="utf-8">\n';
    
    if (data.metadata?.title) {
      html += `<title>${this.escapeHtml(data.metadata.title)}</title>\n`;
    }
    
    html += '</head>\n<body>\n';

    if (data.metadata?.title) {
      html += `<h1>${this.escapeHtml(data.metadata.title)}</h1>\n`;
    }

    if (data.metadata?.author) {
      html += `<p><strong>Author:</strong> ${this.escapeHtml(data.metadata.author)}</p>\n`;
    }

    // Convert text to HTML paragraphs
    const paragraphs = data.text
      .split(/\n\s*\n/)
      .filter(p => p.trim())
      .map(p => p.replace(/\n/g, ' ').trim());

    paragraphs.forEach(paragraph => {
      html += `<p>${this.escapeHtml(paragraph)}</p>\n`;
    });

    if (data.pages) {
      html += '<h2>Pages</h2>\n';
      data.pages.forEach(page => {
        html += `<h3>Page ${page.pageNumber}</h3>\n`;
        const pageParas = page.content
          .split(/\n\s*\n/)
          .filter(p => p.trim())
          .map(p => p.replace(/\n/g, ' ').trim());
        pageParas.forEach(para => {
          html += `<p>${this.escapeHtml(para)}</p>\n`;
        });
      });
    }

    html += '</body>\n</html>';
    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async extractPages(filePath: string, pageRange: string): Promise<string> {
    const result = await this.parseFile(filePath);
    
    if (!result.success || !result.data) {
      throw new Error('Failed to parse PDF');
    }

    if (!result.data.pages) {
      // If pages aren't split, return full text
      return result.data.text;
    }

    const pages = this.parsePageRange(pageRange, result.data.totalPages);
    const selectedPages = pages
      .map(pageNum => result.data!.pages!.find(p => p.pageNumber === pageNum))
      .filter(page => page !== undefined)
      .map(page => page!.content);

    return selectedPages.join('\n\n');
  }

  private parsePageRange(range: string, totalPages: number): number[] {
    const pages: number[] = [];
    const parts = range.split(',');

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (!pages.includes(i)) pages.push(i);
        }
      } else {
        const pageNum = parseInt(part.trim());
        if (pageNum >= 1 && pageNum <= totalPages && !pages.includes(pageNum)) {
          pages.push(pageNum);
        }
      }
    }

    return pages.sort((a, b) => a - b);
  }

  async searchText(filePath: string, query: string, caseSensitive: boolean = false): Promise<any[]> {
    const result = await this.parseFile(filePath);
    
    if (!result.success || !result.data) {
      throw new Error('Failed to parse PDF');
    }

    const searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');
    const matches: any[] = [];

    if (result.data.pages) {
      result.data.pages.forEach(page => {
        const pageMatches = [...page.content.matchAll(searchRegex)];
        pageMatches.forEach(match => {
          matches.push({
            page: page.pageNumber,
            match: match[0],
            index: match.index,
            context: this.getContext(page.content, match.index!, 50)
          });
        });
      });
    } else {
      const textMatches = [...result.data.text.matchAll(searchRegex)];
      textMatches.forEach(match => {
        matches.push({
          match: match[0],
          index: match.index,
          context: this.getContext(result.data!.text, match.index!, 50)
        });
      });
    }

    return matches;
  }

  private getContext(text: string, index: number, contextLength: number): string {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + contextLength);
    return text.slice(start, end);
  }

  updateConfig(newConfig: Partial<PdfConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): PdfConfig {
    return { ...this.config };
  }
}