import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SafetyManager } from './safety-manager';

const execAsync = promisify(exec);

export interface GenerationConfig {
  template: string;
  engine: string;
  fontMain: string;
  fontCode: string;
  fontSize: number;
  colorTheme: string;
  margins: string;
  includeToc: boolean;
  numberSections: boolean;
  syntaxHighlighting: boolean;
  bibliography?: string;
  coverPage?: string;
  customTemplatePath?: string;
}

export interface GenerationResult {
  success: boolean;
  outputPath?: string;
  engineUsed?: string;
  templateUsed?: string;
  generationTime: number;
  warnings: string[];
  errors: string[];
}

export interface TemplateInfo {
  name: string;
  engines: string[];
  installed: boolean;
  preferredEngine?: string;
  description: string;
}

export interface EngineInfo {
  available: boolean;
  description: string;
}

export class TemplateManager {
  private templatesDir: string;
  private templateConfigs: Record<string, any>;

  constructor() {
    this.templatesDir = path.join(process.env.HOME || '', '.local', 'share', 'pandoc', 'templates');
    this.ensureTemplatesDir();
    
    this.templateConfigs = {
      eisvogel: {
        name: "Eisvogel LaTeX Template",
        url: "https://github.com/Wandmalfarbe/pandoc-latex-template/releases/latest/download/eisvogel.zip",
        engines: ["xelatex", "lualatex", "pdflatex"],
        preferredEngine: "xelatex",
        requiresPackages: ["texlive-latex-extra", "texlive-fonts-extra"]
      },
      "typst-modern": {
        name: "Modern Typst Template",
        engines: ["typst"],
        preferredEngine: "typst",
        builtin: true
      },
      academic: {
        name: "Academic Paper Template",
        engines: ["xelatex", "pdflatex"],
        preferredEngine: "xelatex",
        builtin: true
      },
      corporate: {
        name: "Corporate Document Template",
        engines: ["xelatex", "lualatex"],
        preferredEngine: "xelatex",
        builtin: true
      },
      technical: {
        name: "Technical Documentation Template",
        engines: ["xelatex", "lualatex"],
        preferredEngine: "xelatex",
        builtin: true
      }
    };
  }

  private ensureTemplatesDir(): void {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  isTemplateInstalled(templateName: string): boolean {
    if (templateName === "eisvogel") {
      return fs.existsSync(path.join(this.templatesDir, "eisvogel.latex"));
    } else if (templateName.startsWith("typst-")) {
      return this.checkTypstAvailable();
    } else {
      return templateName in this.templateConfigs;
    }
  }

  async installEisvogel(): Promise<boolean> {
    try {
      const https = require('https');
      const AdmZip = require('adm-zip');
      const url = this.templateConfigs.eisvogel.url;
      
      console.log("Downloading Eisvogel template...");
      
      return new Promise((resolve) => {
        const tempFile = path.join('/tmp', 'eisvogel.zip');
        const file = fs.createWriteStream(tempFile);
        
        https.get(url, (response: any) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            
            try {
              const zip = new AdmZip(tempFile);
              const entries = zip.getEntries();
              
              for (const entry of entries) {
                if (entry.entryName.endsWith('eisvogel.latex')) {
                  const content = entry.getData();
                  const targetPath = path.join(this.templatesDir, 'eisvogel.latex');
                  fs.writeFileSync(targetPath, content);
                  console.log(`Eisvogel template installed to ${this.templatesDir}`);
                  fs.unlinkSync(tempFile);
                  resolve(true);
                  return;
                }
              }
              
              console.error("Eisvogel template file not found in download");
              resolve(false);
            } catch (e) {
              console.error("Failed to extract Eisvogel template:", e);
              resolve(false);
            }
          });
        }).on('error', (err: any) => {
          console.error("Failed to download Eisvogel template:", err);
          resolve(false);
        });
      });
    } catch (e) {
      console.error("Failed to install Eisvogel template:", e);
      return false;
    }
  }

  private checkTypstAvailable(): boolean {
    try {
      require('child_process').execSync('typst --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getTemplateInfo(templateName: string): any {
    return this.templateConfigs[templateName] || {};
  }
}

export class PdfGenerator {
  private templateManager: TemplateManager;
  private safetyManager: SafetyManager;
  private engineCache: Record<string, boolean>;

  constructor() {
    this.templateManager = new TemplateManager();
    this.safetyManager = new SafetyManager(true); // Generation mode
    this.engineCache = {};
  }

  async generatePdf(inputPath: string, outputPath: string, config?: GenerationConfig): Promise<GenerationResult> {
    const startTime = Date.now();
    
    const result: GenerationResult = {
      success: false,
      generationTime: 0,
      warnings: [],
      errors: []
    };

    const genConfig: GenerationConfig = {
      template: "eisvogel",
      engine: "auto",
      fontMain: "Liberation Sans",
      fontCode: "Liberation Mono",
      fontSize: 11,
      colorTheme: "professional",
      margins: "normal",
      includeToc: false,
      numberSections: false,
      syntaxHighlighting: true,
      ...config
    };

    try {
      // Validate input
      if (!fs.existsSync(inputPath)) {
        result.errors.push(`Input file not found: ${inputPath}`);
        return result;
      }

      // Safety validation
      const safetyResult = await this.safetyManager.validateFile(inputPath);
      if (!safetyResult.isSafe) {
        result.errors.push(...safetyResult.issues);
        return result;
      }

      // Ensure template is installed
      if (!this.templateManager.isTemplateInstalled(genConfig.template)) {
        if (genConfig.template === "eisvogel") {
          console.log("Installing Eisvogel template...");
          if (!(await this.templateManager.installEisvogel())) {
            result.errors.push("Failed to install Eisvogel template");
            return result;
          }
        } else {
          result.warnings.push(`Template '${genConfig.template}' not found, using default`);
          genConfig.template = "academic";
        }
      }

      // Select engine
      const engine = await this.selectEngine(genConfig);
      if (!engine) {
        result.errors.push("No suitable PDF engine found");
        return result;
      }

      // Generate PDF
      let success: boolean;
      if (engine === "typst") {
        success = await this.generateWithTypst(inputPath, outputPath, genConfig);
      } else {
        success = await this.generateWithPandoc(inputPath, outputPath, genConfig, engine);
      }

      // Finalize result
      result.success = success;
      if (success) {
        result.outputPath = outputPath;
      }
      result.engineUsed = engine;
      result.templateUsed = genConfig.template;
      result.generationTime = Date.now() - startTime;

      if (success) {
        console.log(`PDF generated successfully: ${outputPath}`);
      } else {
        result.errors.push("PDF generation failed");
      }

    } catch (error) {
      result.errors.push(`Generation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private async selectEngine(config: GenerationConfig): Promise<string | null> {
    if (config.engine !== "auto") {
      if (await this.isEngineAvailable(config.engine)) {
        return config.engine;
      } else {
        console.warn(`Requested engine '${config.engine}' not available`);
      }
    }

    // Get template preferences
    const templateInfo = this.templateManager.getTemplateInfo(config.template);
    const preferredEngines = templateInfo.engines || ['xelatex', 'pdflatex', 'typst'];

    // Check engines in preference order
    for (const engine of preferredEngines) {
      if (await this.isEngineAvailable(engine)) {
        return engine;
      }
    }

    // Fallback to any available engine
    const fallbackEngines = ['xelatex', 'pdflatex', 'lualatex', 'typst'];
    for (const engine of fallbackEngines) {
      if (await this.isEngineAvailable(engine)) {
        return engine;
      }
    }

    return null;
  }

  private async isEngineAvailable(engine: string): Promise<boolean> {
    if (engine in this.engineCache) {
      return this.engineCache[engine];
    }

    try {
      await execAsync(`which ${engine}`);
      this.engineCache[engine] = true;
      return true;
    } catch {
      this.engineCache[engine] = false;
      return false;
    }
  }

  private async generateWithPandoc(inputPath: string, outputPath: string, 
                                  config: GenerationConfig, engine: string): Promise<boolean> {
    try {
      const cmd = [
        "pandoc",
        inputPath,
        "-o", outputPath,
        `--pdf-engine=${engine}`
      ];

      // Add template
      if (config.template === "eisvogel") {
        cmd.push("--template", "eisvogel");
      }

      // Typography settings
      cmd.push(
        "--variable", `fontsize=${config.fontSize}pt`,
        "--variable", `mainfont="${config.fontMain}"`,
        "--variable", `monofont="${config.fontCode}"`
      );

      // Margin settings
      if (config.margins === "narrow") {
        cmd.push("--variable", "geometry:margin=0.5in");
      } else if (config.margins === "wide") {
        cmd.push("--variable", "geometry:margin=1.25in");
      } else {
        cmd.push("--variable", "geometry:margin=1in");
      }

      // Additional options
      if (config.includeToc) {
        cmd.push("--toc");
      }

      if (config.numberSections) {
        cmd.push("--number-sections");
      }

      if (config.syntaxHighlighting) {
        cmd.push("--highlight-style", "pygments");
      }

      if (config.bibliography) {
        cmd.push("--bibliography", config.bibliography);
      }

      // Color theme variables for Eisvogel
      if (config.template === "eisvogel") {
        if (config.colorTheme === "corporate") {
          cmd.push(
            "--variable", "titlepage=true",
            "--variable", "colorlinks=true",
            "--variable", "linkcolor=blue"
          );
        }
      }

      // Execute pandoc
      console.debug(`Running pandoc command: ${cmd.join(' ')}`);
      await execAsync(cmd.join(' '), { timeout: 300000 });
      
      return true;
    } catch (error) {
      console.error(`Pandoc failed:`, error);
      return false;
    }
  }

  private async generateWithTypst(inputPath: string, outputPath: string,
                                 config: GenerationConfig): Promise<boolean> {
    try {
      // Read input content
      const content = fs.readFileSync(inputPath, 'utf-8');
      
      // Create basic Typst document
      const typstContent = this.createTypstDocument(content, config);
      
      // Write to temporary Typst file
      const tempPath = path.join('/tmp', `temp_${Date.now()}.typ`);
      fs.writeFileSync(tempPath, typstContent, 'utf-8');
      
      try {
        // Run Typst compiler
        await execAsync(`typst compile "${tempPath}" "${outputPath}"`, { timeout: 60000 });
        return true;
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    } catch (error) {
      console.error(`Typst failed:`, error);
      return false;
    }
  }

  private createTypstDocument(content: string, config: GenerationConfig): string {
    let typstDoc = `
#set text(font: "${config.fontMain}", size: ${config.fontSize}pt)
#set raw(font: "${config.fontCode}")
#set page(margin: 1in)

`;
    
    if (config.includeToc) {
      typstDoc += "#outline()\n\n";
    }
    
    // Basic markdown-to-typst conversion
    const lines = content.split('\n');
    let inCodeBlock = false;
    
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          typstDoc += "```\n";
          inCodeBlock = false;
        } else {
          typstDoc += "```\n";
          inCodeBlock = true;
        }
      } else if (line.startsWith('# ')) {
        typstDoc += `= ${line.slice(2)}\n`;
      } else if (line.startsWith('## ')) {
        typstDoc += `== ${line.slice(3)}\n`;
      } else if (line.startsWith('### ')) {
        typstDoc += `=== ${line.slice(4)}\n`;
      } else {
        typstDoc += `${line}\n`;
      }
    }
    
    return typstDoc;
  }

  listTemplates(): Record<string, TemplateInfo> {
    const templates: Record<string, TemplateInfo> = {};
    
    for (const [name, info] of Object.entries(this.templateManager['templateConfigs'])) {
      templates[name] = {
        name: (info as any).name,
        engines: (info as any).engines,
        installed: this.templateManager.isTemplateInstalled(name),
        preferredEngine: (info as any).preferredEngine,
        description: this.getTemplateDescription(name)
      };
    }
    
    return templates;
  }

  private getTemplateDescription(templateName: string): string {
    const descriptions: Record<string, string> = {
      eisvogel: "Professional LaTeX template with modern typography, ideal for technical documents",
      "typst-modern": "Clean, modern template using Typst engine for fast compilation",
      academic: "Traditional academic paper format with proper citations and structure",
      corporate: "Business-focused template with professional styling and branding",
      technical: "Code-heavy documentation template with excellent syntax highlighting"
    };
    return descriptions[templateName] || "Custom template";
  }

  async getEngineInfo(): Promise<Record<string, EngineInfo>> {
    const engines: Record<string, EngineInfo> = {};
    
    for (const engine of ['xelatex', 'pdflatex', 'lualatex', 'typst']) {
      engines[engine] = {
        available: await this.isEngineAvailable(engine),
        description: this.getEngineDescription(engine)
      };
    }
    
    return engines;
  }

  private getEngineDescription(engine: string): string {
    const descriptions: Record<string, string> = {
      xelatex: "Modern LaTeX engine with excellent Unicode and font support",
      pdflatex: "Traditional LaTeX engine, fast and reliable for basic documents",
      lualatex: "Lua-powered LaTeX engine with advanced scripting capabilities",
      typst: "Modern typesetting system, fast compilation and clean syntax"
    };
    return descriptions[engine] || "PDF generation engine";
  }
}