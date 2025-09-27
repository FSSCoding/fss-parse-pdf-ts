# PDF TypeScript File Handling Enhancement Plan
## Lewis - Agent 2 PDF Specialist

This plan extends the TypeScript PDF parser with equivalent file handling capabilities to match the Python implementation.

## 🎯 TypeScript-Specific Enhancements

### 1. **Enhanced Type Definitions**
**Current State**: Basic types with password support
**Enhancement**: Comprehensive type safety for all new features

```typescript
export interface PDFPermissions {
  canPrint: boolean;
  canCopy: boolean;
  canModify: boolean;
  canExtract: boolean;
  canFillForms: boolean;
  canAssemble: boolean;
}

export interface EmbeddedObject {
  type: 'excel' | 'word' | 'image' | 'other';
  name: string;
  size: number;
  pageNumber: number;
  extractable: boolean;
}

export interface StreamingConfig {
  enabled: boolean;
  chunkSizeMB: number;
  maxSizeMB: number;
  pageByPage: boolean;
}

export interface PrivacyConfig {
  level: 'none' | 'moderate' | 'strict';
  stripMetadata: boolean;
  sanitizeText: boolean;
  removeSystemInfo: boolean;
}

export interface EnhancedPdfConfig extends PdfConfig {
  streamingConfig?: StreamingConfig;
  privacyConfig?: PrivacyConfig;
  enableOCRFallback?: boolean;
  detectEmbeddedObjects?: boolean;
  permissions?: PDFPermissions;
}
```

### 2. **Permission Detection System**
```typescript
export class PDFPermissionAnalyzer {
  async analyzePermissions(filePath: string): Promise<PDFPermissions> {
    const pdfBuffer = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    // Use pdf-lib to check permission flags
    const permissions = {
      canPrint: this.checkPrintPermission(pdfDoc),
      canCopy: this.checkCopyPermission(pdfDoc),
      canModify: this.checkModifyPermission(pdfDoc),
      canExtract: this.checkExtractPermission(pdfDoc),
      canFillForms: this.checkFormPermission(pdfDoc),
      canAssemble: this.checkAssemblePermission(pdfDoc)
    };
    
    return permissions;
  }
  
  private checkPrintPermission(doc: PDFDocument): boolean {
    // Implementation using pdf-lib permission checking
    // Return false if print is restricted
    return true; // Placeholder
  }
}
```

### 3. **Streaming Architecture for Large Files**
```typescript
export class StreamingPDFProcessor {
  private readonly maxMemoryMB: number;
  private readonly chunkSizeMB: number;
  
  constructor(config: StreamingConfig) {
    this.maxMemoryMB = config.maxSizeMB;
    this.chunkSizeMB = config.chunkSizeMB;
  }
  
  async processLargeFile(filePath: string): Promise<ProcessingResult> {
    const fileStats = await fs.stat(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    
    if (fileSizeMB > this.maxMemoryMB) {
      return this.streamProcess(filePath);
    } else {
      return this.standardProcess(filePath);
    }
  }
  
  private async streamProcess(filePath: string): Promise<ProcessingResult> {
    const results: PageInfo[] = [];
    const pdfBuffer = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    // Process page by page to minimize memory usage
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const pageResult = await this.processSinglePage(pdfDoc, i);
      results.push(pageResult);
      
      // Trigger garbage collection hint
      if (global.gc && i % 10 === 0) {
        global.gc();
      }
    }
    
    return {
      success: true,
      data: {
        text: results.map(r => r.content).join('\n'),
        pages: results,
        totalPages: results.length
      },
      warnings: ['Processed using streaming mode for large file']
    };
  }
}
```

### 4. **Hybrid PDF OCR Fallback**
```typescript
export class HybridPDFProcessor {
  private readonly ocrThreshold: number = 0.3;
  private readonly minTextLength: number = 50;
  
  async extractWithOCRFallback(filePath: string): Promise<ProcessingResult> {
    // First attempt: standard text extraction
    const textResult = await this.extractText(filePath);
    
    // Evaluate if OCR fallback is needed
    if (this.needsOCRFallback(textResult)) {
      console.log('Low text confidence, attempting OCR fallback...');
      const ocrResult = await this.performOCR(filePath);
      return this.mergeResults(textResult, ocrResult);
    }
    
    return textResult;
  }
  
  private needsOCRFallback(result: ProcessingResult): boolean {
    if (!result.success || !result.data) return true;
    
    const textLength = result.data.text.trim().length;
    const confidence = this.calculateTextConfidence(result.data.text);
    
    return confidence < this.ocrThreshold || textLength < this.minTextLength;
  }
  
  private async performOCR(filePath: string): Promise<ProcessingResult> {
    // Convert PDF pages to images and perform OCR
    // This would integrate with Tesseract.js or similar
    return {
      success: true,
      data: { text: 'OCR extracted text...', totalPages: 1 },
      warnings: ['Content extracted using OCR fallback']
    };
  }
}
```

### 5. **Embedded Object Detection**
```typescript
export class EmbeddedObjectDetector {
  async detectEmbeddedObjects(filePath: string): Promise<EmbeddedObject[]> {
    const pdfBuffer = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const embeddedObjects: EmbeddedObject[] = [];
    
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      
      // Check for embedded files and objects
      const pageObjects = await this.analyzePageObjects(page, i);
      embeddedObjects.push(...pageObjects);
    }
    
    return embeddedObjects;
  }
  
  private async analyzePageObjects(page: any, pageNumber: number): Promise<EmbeddedObject[]> {
    // Analyze page for embedded files
    // Look for OLE objects, embedded documents, etc.
    const objects: EmbeddedObject[] = [];
    
    // Implementation would use pdf-lib to inspect page objects
    // and identify embedded content
    
    return objects;
  }
}
```

### 6. **Metadata Privacy Manager**
```typescript
export class MetadataPrivacyManager {
  constructor(private config: PrivacyConfig) {}
  
  sanitizeMetadata(metadata: PdfMetadata): PdfMetadata {
    const sanitized = { ...metadata };
    
    switch (this.config.level) {
      case 'strict':
        sanitized.author = undefined;
        sanitized.creator = undefined;
        sanitized.producer = undefined;
        sanitized.creationDate = null;
        sanitized.modificationDate = null;
        sanitized.keywords = undefined;
        break;
        
      case 'moderate':
        sanitized.creator = undefined;
        sanitized.producer = undefined;
        break;
        
      case 'none':
      default:
        // No sanitization
        break;
    }
    
    return sanitized;
  }
  
  sanitizeText(text: string): string {
    if (!this.config.sanitizeText) return text;
    
    // Remove potential sensitive information
    let sanitized = text;
    
    // Remove file paths
    sanitized = sanitized.replace(/[A-Za-z]:\\[\\\w\s.-]+/g, '[PATH_REMOVED]');
    sanitized = sanitized.replace(/\/[\w\/.-]+\//g, '[PATH_REMOVED]');
    
    // Remove usernames
    sanitized = sanitized.replace(/User:\s*\w+/g, 'User: [REDACTED]');
    
    // Remove system information
    if (this.config.removeSystemInfo) {
      sanitized = sanitized.replace(/Windows \d+\.\d+/g, '[OS_REDACTED]');
      sanitized = sanitized.replace(/Microsoft Office \d+/g, '[SOFTWARE_REDACTED]');
    }
    
    return sanitized;
  }
}
```

### 7. **Enhanced CLI Integration**
```typescript
// Add new CLI options for enhanced features
program
  .command('extract')
  .option('--privacy-level <level>', 'Privacy level (none|moderate|strict)', 'none')
  .option('--max-size <mb>', 'Maximum file size in MB before streaming', '100')
  .option('--enable-ocr-fallback', 'Enable OCR fallback for low-confidence text')
  .option('--detect-embedded', 'Detect and report embedded objects')
  .option('--strip-metadata', 'Remove sensitive metadata')
  .action(async (input: string, options: any) => {
    const config: EnhancedPdfConfig = {
      ...options,
      privacyConfig: {
        level: options.privacyLevel,
        stripMetadata: options.stripMetadata,
        sanitizeText: options.privacyLevel !== 'none',
        removeSystemInfo: options.privacyLevel === 'strict'
      },
      streamingConfig: {
        enabled: true,
        maxSizeMB: parseInt(options.maxSize),
        chunkSizeMB: 50,
        pageByPage: true
      },
      enableOCRFallback: options.enableOcrFallback,
      detectEmbeddedObjects: options.detectEmbedded
    };
    
    const processor = new EnhancedPDFProcessor(config);
    const result = await processor.processFile(input);
    
    // Handle result with enhanced features
  });
```

## 🔧 Implementation Roadmap

### Phase 1: Foundation (Week 1)
- Enhanced type definitions
- Permission detection system
- Basic streaming architecture

### Phase 2: Advanced Features (Week 2)
- OCR fallback implementation
- Embedded object detection
- Metadata privacy controls

### Phase 3: Integration (Week 3)
- CLI integration
- Error handling
- Performance optimization

### Phase 4: Testing (Week 4)
- Comprehensive test suite
- Performance benchmarks
- Cross-platform compatibility

## 🧪 TypeScript-Specific Testing

```typescript
describe('Enhanced PDF Processing', () => {
  test('should handle large files with streaming', async () => {
    const result = await processor.processLargeFile('large-file.pdf');
    expect(result.success).toBe(true);
    expect(result.warnings).toContain('streaming mode');
  });
  
  test('should detect permission restrictions', async () => {
    const permissions = await analyzer.analyzePermissions('restricted.pdf');
    expect(permissions.canPrint).toBe(false);
  });
  
  test('should sanitize metadata based on privacy level', () => {
    const sanitized = privacyManager.sanitizeMetadata(metadata);
    expect(sanitized.author).toBeUndefined();
  });
});
```

This TypeScript enhancement plan provides full feature parity with the Python implementation while leveraging TypeScript's type safety and modern async/await patterns!