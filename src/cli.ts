#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { PdfParser } from './pdf-parser';
import { PdfGenerator, GenerationConfig } from './pdf-generator';
import { PDFModifier, SignatureOptions, FormFillData, TextInsertion, ImageInsertion } from './pdf-modifier';
import { PdfConfig } from './types';

const program = new Command();

program
  .name('fss-parse-pdf-ts')
  .description('Professional TypeScript PDF parsing and manipulation toolkit')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract text from PDF document')
  .argument('<input>', 'Input PDF file path')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <format>', 'Output format (text|markdown|html|json)', 'text')
  .option('-p, --pages <range>', 'Specific pages to extract (e.g., 1,3,5-10)')
  .option('--no-metadata', 'Skip metadata extraction')
  .option('--page-info', 'Include individual page information')
  .option('--max-pages <number>', 'Maximum number of pages to process')
  .option('--password <password>', 'PDF password if encrypted')
  .action(async (input: string, options: any) => {
    const spinner = ora('Extracting content from PDF...').start();

    try {
      const config: PdfConfig = {
        extractMetadata: options.metadata !== false,
        includePageInfo: options.pageInfo,
        outputFormat: options.format,
        password: options.password
      };
      
      if (options.maxPages) {
        config.maxPages = parseInt(options.maxPages);
      }

      const parser = new PdfParser(config);
      
      let content: string;
      
      if (options.pages) {
        content = await parser.extractPages(input, options.pages);
      } else {
        const result = await parser.parseFile(input);
        
        if (!result.success) {
          spinner.fail('Extraction failed');
          if (result.errors?.length) {
            console.error(chalk.red('Errors:'));
            result.errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
          }
          process.exit(1);
        }
        
        content = await parser.convertToFormat(result.data!, options.format);
      }
      
      if (options.output) {
        fs.writeFileSync(options.output, content, 'utf8');
        spinner.succeed(`Content extracted to ${chalk.green(options.output)}`);
      } else {
        spinner.stop();
        console.log(content);
      }

    } catch (error) {
      spinner.fail('Processing failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Display PDF document information')
  .argument('<input>', 'Input PDF file path')
  .option('--detailed', 'Show detailed information')
  .action(async (input: string, options: any) => {
    const spinner = ora('Reading PDF information...').start();

    try {
      const parser = new PdfParser({ extractMetadata: true });
      const result = await parser.parseFile(input);

      if (!result.success) {
        spinner.fail('Failed to read PDF');
        if (result.errors?.length) {
          result.errors.forEach(error => console.error(chalk.red(error)));
        }
        process.exit(1);
      }

      spinner.stop();

      console.log(chalk.blue.bold(`\n📄 ${path.basename(input)}`));
      console.log(chalk.gray('─'.repeat(50)));

      if (result.data) {
        console.log(`${chalk.yellow('Pages:')} ${result.data.totalPages}`);
        
        if (result.metadata) {
          if (result.metadata.title) {
            console.log(`${chalk.yellow('Title:')} ${result.metadata.title}`);
          }
          if (result.metadata.author) {
            console.log(`${chalk.yellow('Author:')} ${result.metadata.author}`);
          }
          if (result.metadata.subject) {
            console.log(`${chalk.yellow('Subject:')} ${result.metadata.subject}`);
          }
          if (result.metadata.creator) {
            console.log(`${chalk.yellow('Creator:')} ${result.metadata.creator}`);
          }
          if (result.metadata.producer) {
            console.log(`${chalk.yellow('Producer:')} ${result.metadata.producer}`);
          }
          if (result.metadata.creationDate) {
            console.log(`${chalk.yellow('Created:')} ${result.metadata.creationDate.toLocaleDateString()}`);
          } else {
            console.log(`${chalk.yellow('Created:')} Not available`);
          }
          if (result.metadata.modificationDate) {
            console.log(`${chalk.yellow('Modified:')} ${result.metadata.modificationDate.toLocaleDateString()}`);
          } else {
            console.log(`${chalk.yellow('Modified:')} Not available`);
          }
          if (result.metadata.encrypted !== undefined) {
            console.log(`${chalk.yellow('Encrypted:')} ${result.metadata.encrypted ? 'Yes' : 'No'}`);
          }
        }

        if (options.detailed) {
          const wordCount = result.data.text.split(/\s+/).length;
          const charCount = result.data.text.length;
          
          console.log(chalk.gray('\nContent Analysis:'));
          console.log(`  Text Length: ${charCount} characters`);
          console.log(`  Word Count: ${wordCount} words`);
        }
      }

    } catch (error) {
      spinner.fail('Information extraction failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for text in PDF document')
  .argument('<input>', 'Input PDF file path')
  .argument('<query>', 'Search query')
  .option('-i, --ignore-case', 'Case insensitive search')
  .option('--context <length>', 'Context length around matches', '50')
  .action(async (input: string, query: string, options: any) => {
    const spinner = ora(`Searching for "${query}"...`).start();

    try {
      const parser = new PdfParser({ includePageInfo: true });
      const matches = await parser.searchText(input, query, !options.ignoreCase);

      spinner.stop();

      if (matches.length === 0) {
        console.log(chalk.yellow('No matches found.'));
        return;
      }

      console.log(chalk.green(`\n✅ Found ${matches.length} matches:\n`));

      matches.forEach((match, index) => {
        console.log(chalk.blue(`Match ${index + 1}:`));
        if (match.page) {
          console.log(`  Page: ${match.page}`);
        }
        console.log(`  Text: "${chalk.yellow(match.match)}"`);
        console.log(`  Context: "${match.context}"`);
        console.log('');
      });

    } catch (error) {
      spinner.fail('Search failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('convert')
  .description('Convert PDF to different formats')
  .argument('<input>', 'Input PDF file path')
  .argument('<output>', 'Output file path')
  .option('-f, --format <format>', 'Output format (text|markdown|html|json)', 'markdown')
  .option('--page-info', 'Include page information')
  .option('--password <password>', 'PDF password if encrypted')
  .action(async (input: string, output: string, options: any) => {
    const spinner = ora(`Converting ${path.basename(input)} to ${options.format}...`).start();

    try {
      const config: PdfConfig = {
        includePageInfo: options.pageInfo,
        outputFormat: options.format,
        password: options.password
      };

      const parser = new PdfParser(config);
      const result = await parser.parseFile(input);

      if (!result.success) {
        spinner.fail('Conversion failed');
        if (result.errors?.length) {
          result.errors.forEach(error => console.error(chalk.red(error)));
        }
        process.exit(1);
      }

      if (result.data) {
        const converted = await parser.convertToFormat(result.data, options.format);
        fs.writeFileSync(output, converted, 'utf8');
        spinner.succeed(`Converted to ${chalk.green(output)}`);
      }

    } catch (error) {
      spinner.fail('Conversion failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate PDF file safety and integrity')
  .argument('<input>', 'Input PDF file path')
  .action(async (input: string) => {
    const spinner = ora('Validating PDF file...').start();

    try {
      const parser = new PdfParser({ safetyChecks: true });
      const result = await parser.parseFile(input);

      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✅ PDF validation passed'));
        
        if (result.warnings?.length) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
      } else {
        console.log(chalk.red('❌ PDF validation failed'));
        
        if (result.errors?.length) {
          console.log(chalk.red('\nErrors:'));
          result.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        process.exit(1);
      }

    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('Generate professional PDF from Markdown or text')
  .argument('<input>', 'Input file path (Markdown, text, etc.)')
  .argument('<output>', 'Output PDF file path')
  .option('-t, --template <template>', 'Template to use', 'eisvogel')
  .option('-e, --engine <engine>', 'PDF engine to use', 'auto')
  .option('--font-main <font>', 'Main font family', 'Liberation Sans')
  .option('--font-code <font>', 'Code font family', 'Liberation Mono')
  .option('--font-size <size>', 'Font size', '11')
  .option('--margins <margins>', 'Page margins (narrow|normal|wide)', 'normal')
  .option('--toc', 'Include table of contents')
  .option('--number-sections', 'Number sections')
  .option('--syntax-highlighting', 'Enable syntax highlighting', true)
  .option('--bibliography <file>', 'Bibliography file')
  .option('--color-theme <theme>', 'Color theme', 'professional')
  .action(async (input: string, output: string, options: any) => {
    const spinner = ora(`Generating PDF with ${options.template} template...`).start();

    try {
      const config: GenerationConfig = {
        template: options.template,
        engine: options.engine,
        fontMain: options.fontMain,
        fontCode: options.fontCode,
        fontSize: parseInt(options.fontSize),
        margins: options.margins,
        includeToc: options.toc || false,
        numberSections: options.numberSections || false,
        syntaxHighlighting: options.syntaxHighlighting,
        bibliography: options.bibliography,
        colorTheme: options.colorTheme
      };

      const generator = new PdfGenerator();
      const result = await generator.generatePdf(input, output, config);

      if (result.success) {
        spinner.succeed(`PDF generated successfully: ${chalk.green(output)}`);
        
        console.log(chalk.blue('\n📊 Generation Details:'));
        console.log(`  Template: ${result.templateUsed}`);
        console.log(`  Engine: ${result.engineUsed}`);
        console.log(`  Time: ${(result.generationTime / 1000).toFixed(2)}s`);
        
        if (result.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
      } else {
        spinner.fail('PDF generation failed');
        if (result.errors.length > 0) {
          console.log(chalk.red('\nErrors:'));
          result.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        process.exit(1);
      }

    } catch (error) {
      spinner.fail('Generation failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

program
  .command('templates')
  .description('List available templates and engines')
  .option('--engines', 'Show PDF engines information')
  .action(async (options: any) => {
    const spinner = ora('Loading template information...').start();

    try {
      const generator = new PdfGenerator();
      const templates = generator.listTemplates();
      
      spinner.stop();
      
      console.log(chalk.blue.bold('\n📄 Available PDF Templates:'));
      console.log(chalk.gray('─'.repeat(80)));
      
      Object.entries(templates).forEach(([id, info]) => {
        const status = info.installed ? chalk.green('✅ Installed') : chalk.red('❌ Not Installed');
        const engines = info.engines.join(', ');
        
        console.log(`\n${chalk.cyan.bold(id)}: ${info.name}`);
        console.log(`  Status: ${status}`);
        console.log(`  Engines: ${chalk.yellow(engines)}`);
        console.log(`  Description: ${info.description}`);
      });
      
      if (options.engines) {
        const engines = await generator.getEngineInfo();
        
        console.log(chalk.blue.bold('\n⚙️  Available PDF Engines:'));
        console.log(chalk.gray('─'.repeat(80)));
        
        Object.entries(engines).forEach(([name, info]) => {
          const status = info.available ? chalk.green('✅ Available') : chalk.red('❌ Not Available');
          
          console.log(`\n${chalk.cyan.bold(name)}`);
          console.log(`  Status: ${status}`);
          console.log(`  Description: ${info.description}`);
        });
      }

    } catch (error) {
      spinner.fail('Failed to load template information');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

program
  .command('modify')
  .description('Modify PDF by adding signatures, filling forms, or inserting text/images')
  .argument('<input>', 'Input PDF file path')
  .argument('<output>', 'Output PDF file path')
  .option('--add-signature <path>', 'Add signature image to PDF')
  .option('--signature-position <coords>', 'Signature position as x1,y1,x2,y2', '400,700,500,750')
  .option('--fill-form <field:value>', 'Fill form field as field_name:value', [])
  .option('--add-text <text>', 'Add text to PDF')
  .option('--text-position <coords>', 'Text position as x,y', '100,100')
  .option('--text-page <number>', 'Page number for text (0-based)', '0')
  .option('--font-size <size>', 'Font size for text', '12')
  .action(async (input: string, output: string, options: any) => {
    const spinner = ora('Modifying PDF...').start();

    try {
      const modifier = new PDFModifier();
      
      // Parse options
      const signatures: SignatureOptions[] = [];
      const formData: FormFillData[] = [];
      const textInsertions: TextInsertion[] = [];
      const imageInsertions: ImageInsertion[] = [];

      // Handle signature addition
      if (options.addSignature) {
        const positionParts = options.signaturePosition.split(',').map((x: string) => parseFloat(x.trim()));
        if (positionParts.length !== 4) {
          throw new Error('Signature position must be x1,y1,x2,y2');
        }
        
        signatures.push({
          position: positionParts as [number, number, number, number],
          imagePath: options.addSignature
        });
      }

      // Handle form filling (support multiple --fill-form options)
      const fillFormOptions = Array.isArray(options.fillForm) ? options.fillForm : [options.fillForm].filter(Boolean);
      for (const formItem of fillFormOptions) {
        if (typeof formItem === 'string' && formItem.includes(':')) {
          const [fieldName, ...valueParts] = formItem.split(':');
          const fieldValue = valueParts.join(':').trim();
          formData.push({
            fieldName: fieldName.trim(),
            fieldValue
          });
        }
      }

      // Handle text insertion
      if (options.addText) {
        const positionParts = options.textPosition.split(',').map((x: string) => parseFloat(x.trim()));
        if (positionParts.length !== 2) {
          throw new Error('Text position must be x,y');
        }
        
        textInsertions.push({
          text: options.addText,
          position: positionParts as [number, number],
          pageNumber: parseInt(options.textPage),
          fontSize: parseInt(options.fontSize)
        });
      }

      if (signatures.length === 0 && formData.length === 0 && textInsertions.length === 0 && imageInsertions.length === 0) {
        spinner.fail('No modifications specified. Use --help to see available options.');
        return;
      }

      // Perform modifications
      const result = await modifier.modifyPdf({
        inputPath: input,
        outputPath: output,
        signatures,
        formData,
        textInsertions,
        imageInsertions
      });

      if (result.success) {
        spinner.succeed('PDF modified successfully!');
        console.log(chalk.green(`📄 Output: ${result.outputPath}`));
        console.log(chalk.blue(`📊 ${result.modificationsApplied} total modifications applied`));
        console.log(chalk.blue(`⏱️  Processing time: ${result.processingTime}ms`));
        
        if (result.signaturesAdded > 0) {
          console.log(chalk.green(`✍️  ${result.signaturesAdded} signature(s) added`));
        }
        if (result.formsFilled > 0) {
          console.log(chalk.green(`📝 ${result.formsFilled} form field(s) filled`));
        }
        if (result.textInsertions > 0) {
          console.log(chalk.green(`📄 ${result.textInsertions} text element(s) inserted`));
        }
        if (result.imageInsertions > 0) {
          console.log(chalk.green(`🖼️  ${result.imageInsertions} image(s) inserted`));
        }
      } else {
        spinner.fail(`PDF modification failed: ${result.errorMessage}`);
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

program
  .command('batch-modify')
  .description('Batch modify multiple PDF files with same modifications')
  .argument('<inputDir>', 'Input directory containing PDF files')
  .argument('<outputDir>', 'Output directory for modified PDFs')
  .option('--pattern <pattern>', 'File pattern to match', '*.pdf')
  .option('--add-signature <path>', 'Add signature image to all PDFs')
  .option('--signature-position <coords>', 'Signature position as x1,y1,x2,y2', '400,700,500,750')
  .option('--fill-form <field:value>', 'Fill form field as field_name:value', [])
  .option('--add-text <text>', 'Add text to all PDFs')
  .option('--text-position <coords>', 'Text position as x,y', '100,100')
  .option('--text-page <number>', 'Page number for text (0-based)', '0')
  .option('--font-size <size>', 'Font size for text', '12')
  .option('--all-pages', 'Apply text/signature to all pages', false)
  .option('--config <path>', 'JSON configuration file for complex modifications')
  .option('--template <name>', 'Use predefined modification template')
  .option('--preview-only', 'Preview modifications without applying', false)
  .option('--parallel', 'Process files in parallel', false)
  .action(async (inputDir: string, outputDir: string, options: any) => {
    const spinner = ora('Finding PDF files...').start();

    try {
      const glob = require('glob');
      const path = require('path');
      
      // Create output directory
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Find matching files
      const pattern = path.join(inputDir, options.pattern);
      const files = glob.sync(pattern).filter((file: string) => file.toLowerCase().endsWith('.pdf'));

      if (files.length === 0) {
        spinner.fail(`No PDF files matching '${options.pattern}' found in ${inputDir}`);
        return;
      }

      spinner.succeed(`Found ${files.length} PDF files to modify`);

      // Load configuration or template
      let modifications: any = {};
      
      if (options.config) {
        modifications = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        console.log(chalk.blue(`Loaded configuration from ${options.config}`));
      }

      if (options.template) {
        const templateConfig = loadModificationTemplate(options.template);
        if (templateConfig) {
          modifications = { ...modifications, ...templateConfig };
          console.log(chalk.blue(`Applied template: ${options.template}`));
        } else {
          console.log(chalk.yellow(`Unknown template: ${options.template}`));
        }
      }

      // Build modifications from CLI args if no config/template
      if (Object.keys(modifications).length === 0) {
        const signatures: SignatureOptions[] = [];
        const formData: FormFillData[] = [];
        const textInsertions: TextInsertion[] = [];

        if (options.addSignature) {
          const positionParts = options.signaturePosition.split(',').map((x: string) => parseFloat(x.trim()));
          signatures.push({
            position: positionParts as [number, number, number, number],
            imagePath: options.addSignature
          });
        }

        const fillFormOptions = Array.isArray(options.fillForm) ? options.fillForm : [options.fillForm].filter(Boolean);
        for (const formItem of fillFormOptions) {
          if (typeof formItem === 'string' && formItem.includes(':')) {
            const [fieldName, ...valueParts] = formItem.split(':');
            formData.push({
              fieldName: fieldName.trim(),
              fieldValue: valueParts.join(':').trim()
            });
          }
        }

        if (options.addText) {
          const positionParts = options.textPosition.split(',').map((x: string) => parseFloat(x.trim()));
          textInsertions.push({
            text: options.addText,
            position: positionParts as [number, number],
            pageNumber: parseInt(options.textPage),
            fontSize: parseInt(options.fontSize)
          });
        }

        modifications = { signatures, formData, textInsertions, allPages: options.allPages };
      }

      if (options.previewOnly) {
        console.log(chalk.yellow('PREVIEW MODE - No files will be modified'));
        console.log(chalk.blue('Modifications to apply:'));
        previewModifications(modifications);
        return;
      }

      // Process files
      const results: any[] = [];
      const modifier = new PDFModifier();

      if (options.parallel && files.length > 1) {
        console.log(chalk.blue(`Processing ${files.length} files in parallel...`));
        
        const promises = files.map(async (file: string) => {
          try {
            const outputFile = path.join(outputDir, path.basename(file));
            
            let result;
            if (options.allPages && modifications.textInsertions?.length > 0) {
              result = await applyModificationsAllPages(modifier, file, outputFile, modifications);
            } else {
              result = await modifier.modifyPdf({
                inputPath: file,
                outputPath: outputFile,
                signatures: modifications.signatures || [],
                formData: modifications.formData || [],
                textInsertions: modifications.textInsertions || []
              });
            }

            if (result.success) {
              return { file: path.basename(file), status: 'success', modifications: result.modificationsApplied, time: result.processingTime };
            } else {
              return { file: path.basename(file), status: 'failed', error: result.errorMessage };
            }
          } catch (error) {
            return { file: path.basename(file), status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
          }
        });

        const parallelSpinner = ora('Processing files in parallel...').start();
        results.push(...await Promise.all(promises));
        parallelSpinner.succeed('Parallel processing complete');
      } else {
        console.log(chalk.blue(`Processing ${files.length} files sequentially...`));
        
        for (const file of files) {
          try {
            const outputFile = path.join(outputDir, path.basename(file));
            
            let result;
            if (options.allPages && modifications.textInsertions?.length > 0) {
              result = await applyModificationsAllPages(modifier, file, outputFile, modifications);
            } else {
              result = await modifier.modifyPdf({
                inputPath: file,
                outputPath: outputFile,
                signatures: modifications.signatures || [],
                formData: modifications.formData || [],
                textInsertions: modifications.textInsertions || []
              });
            }

            if (result.success) {
              console.log(chalk.green(`✅ ${path.basename(file)} - ${result.modificationsApplied} modifications applied`));
              results.push({ file: path.basename(file), status: 'success', modifications: result.modificationsApplied, time: result.processingTime });
            } else {
              console.log(chalk.red(`❌ ${path.basename(file)} - ${result.errorMessage}`));
              results.push({ file: path.basename(file), status: 'failed', error: result.errorMessage });
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.log(chalk.red(`❌ ${path.basename(file)} - ${errorMsg}`));
            results.push({ file: path.basename(file), status: 'failed', error: errorMsg });
          }
        }
      }

      // Print summary
      const successful = results.filter(r => r.status === 'success').length;
      const failed = results.length - successful;
      const totalModifications = results.filter(r => r.status === 'success').reduce((sum, r) => sum + (r.modifications || 0), 0);

      console.log(chalk.green('\nBatch modification complete!'));
      console.log(chalk.green(`✅ Successful: ${successful}/${files.length}`));
      console.log(chalk.blue(`📊 Total modifications applied: ${totalModifications}`));
      if (failed > 0) {
        console.log(chalk.red(`❌ Failed: ${failed}`));
      }

    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Helper functions
function loadModificationTemplate(templateName: string): any {
  const templates: Record<string, any> = {
    'approval-stamp': {
      textInsertions: [
        {
          text: 'APPROVED',
          position: [450, 50],
          fontSize: 16
        },
        {
          text: `Date: ${new Date().toISOString().split('T')[0]}`,
          position: [450, 30],
          fontSize: 10
        }
      ]
    },
    'confidential-watermark': {
      textInsertions: [
        {
          text: 'CONFIDENTIAL',
          position: [200, 400],
          fontSize: 48
        }
      ],
      allPages: true
    },
    'signature-bottom-right': {
      signatures: [
        {
          position: [400, 50, 500, 100],
          text: 'Authorized Signature'
        }
      ]
    },
    'review-stamp': {
      textInsertions: [
        {
          text: 'REVIEWED',
          position: [50, 50],
          fontSize: 12
        },
        {
          text: `Agent 2 - ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}`,
          position: [50, 30],
          fontSize: 8
        }
      ]
    }
  };

  return templates[templateName];
}

function previewModifications(modifications: any): void {
  if (modifications.signatures?.length > 0) {
    console.log(`  📝 ${modifications.signatures.length} signature(s)`);
    for (const sig of modifications.signatures) {
      if (sig.imagePath) {
        console.log(`    • Image signature: ${sig.imagePath}`);
      } else if (sig.text) {
        console.log(`    • Text signature: ${sig.text}`);
      }
    }
  }

  if (modifications.formData?.length > 0) {
    console.log(`  📋 ${modifications.formData.length} form field(s)`);
    for (const form of modifications.formData) {
      console.log(`    • ${form.fieldName}: ${form.fieldValue}`);
    }
  }

  if (modifications.textInsertions?.length > 0) {
    console.log(`  📄 ${modifications.textInsertions.length} text insertion(s)`);
    for (const text of modifications.textInsertions) {
      console.log(`    • '${text.text}' at [${text.position[0]}, ${text.position[1]}]`);
    }
  }

  if (modifications.allPages) {
    console.log(`  🔄 Apply to all pages: Yes`);
  }
}

async function applyModificationsAllPages(modifier: PDFModifier, inputPath: string, outputPath: string, modifications: any): Promise<any> {
  const { PDFDocument } = require('pdf-lib');
  const fs = require('fs');
  
  // Get page count first
  const existingPdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pageCount = pdfDoc.getPageCount();

  // Create text insertions for all pages
  const allTextInsertions: TextInsertion[] = [];
  const baseTextInsertions = modifications.textInsertions || [];

  for (let pageNum = 0; pageNum < pageCount; pageNum++) {
    for (const textItem of baseTextInsertions) {
      allTextInsertions.push({
        text: textItem.text,
        position: textItem.position,
        pageNumber: pageNum,
        fontSize: textItem.fontSize
      });
    }
  }

  // Apply all modifications
  return modifier.modifyPdf({
    inputPath,
    outputPath,
    signatures: modifications.signatures || [],
    formData: modifications.formData || [],
    textInsertions: allTextInsertions
  });
}

program.parse();