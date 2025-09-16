#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { PdfParser } from './pdf-parser';
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
          }
          if (result.metadata.modificationDate) {
            console.log(`${chalk.yellow('Modified:')} ${result.metadata.modificationDate.toLocaleDateString()}`);
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

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

program.parse();