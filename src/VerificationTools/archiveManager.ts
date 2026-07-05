#!/usr/bin/env ts-node

/**
 * Archive Manager for Verification Results
 * Automatically archives files older than specified days to timestamped directories
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const rename = promisify(fs.rename);
const writeFile = promisify(fs.writeFile);

interface ArchiveConfig {
    maxAge: number;           // Maximum age in days before archiving
    excludePaths: string[];   // Paths to exclude from archiving
    compressJson: boolean;    // Whether to compress JSON files
    keepLatest: boolean;      // Keep the latest file of each type
    dryRun: boolean;         // Preview mode without actual changes
    targetDir: string;       // Target directory to scan
}

interface ArchiveResult {
    archived: string[];
    skipped: string[];
    errors: string[];
    totalSize: number;
    archiveDir: string;
}

class ArchiveManager {
    private config: ArchiveConfig;
    private result: ArchiveResult;

    constructor(config: Partial<ArchiveConfig> = {}) {
        this.config = {
            maxAge: 7,
            excludePaths: ['archive', 'checkpoints', '.git', 'node_modules'],
            compressJson: false,
            keepLatest: true,
            dryRun: false,
            targetDir: path.join(process.cwd(), 'verification-results'),
            ...config
        };

        this.result = {
            archived: [],
            skipped: [],
            errors: [],
            totalSize: 0,
            archiveDir: ''
        };
    }

    /**
     * Get file age in days
     */
    private async getFileAge(filePath: string): Promise<number> {
        try {
            const stats = await stat(filePath);
            const now = new Date().getTime();
            const fileTime = stats.mtime.getTime();
            return (now - fileTime) / (1000 * 60 * 60 * 24);
        } catch (error) {
            console.error(`Error getting file age for ${filePath}:`, error);
            return 0;
        }
    }

    /**
     * Create timestamped archive directory
     */
    private async createTimestampedArchive(): Promise<string> {
        const timestamp = new Date().toISOString()
            .replace(/:/g, '-')
            .replace(/\./g, '-')
            .slice(0, 19);
        
        const archiveDir = path.join(this.config.targetDir, `archive-${timestamp}`);
        
        if (!this.config.dryRun) {
            await mkdir(archiveDir, { recursive: true });
            console.log(`✅ Created archive directory: ${path.basename(archiveDir)}`);
        } else {
            console.log(`[DRY RUN] Would create: ${path.basename(archiveDir)}`);
        }
        
        return archiveDir;
    }

    /**
     * Check if path should be excluded
     */
    private shouldExclude(filePath: string): boolean {
        const relativePath = path.relative(this.config.targetDir, filePath);
        return this.config.excludePaths.some(excludePath => 
            relativePath.startsWith(excludePath)
        );
    }

    /**
     * Get file size in bytes
     */
    private async getFileSize(filePath: string): Promise<number> {
        try {
            const stats = await stat(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }

    /**
     * Archive a single file
     */
    private async archiveFile(filePath: string, archiveDir: string): Promise<void> {
        const relativePath = path.relative(this.config.targetDir, filePath);
        const targetPath = path.join(archiveDir, relativePath);
        const targetDir = path.dirname(targetPath);

        if (!this.config.dryRun) {
            await mkdir(targetDir, { recursive: true });
            await rename(filePath, targetPath);
        }

        const size = await this.getFileSize(filePath);
        this.result.totalSize += size;
        this.result.archived.push(relativePath);

        if (this.config.dryRun) {
            console.log(`[DRY RUN] Would archive: ${relativePath} (${this.formatSize(size)})`);
        } else {
            console.log(`  📦 Archived: ${relativePath} (${this.formatSize(size)})`);
        }
    }

    /**
     * Format size in human-readable format
     */
    private formatSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Scan directory recursively and archive old files
     */
    private async scanDirectory(dir: string, archiveDir: string): Promise<void> {
        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // Skip excluded paths
                if (this.shouldExclude(fullPath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath, archiveDir);
                } else if (entry.isFile()) {
                    const age = await this.getFileAge(fullPath);
                    
                    if (age > this.config.maxAge) {
                        try {
                            await this.archiveFile(fullPath, archiveDir);
                        } catch (error) {
                            console.error(`  ❌ Error archiving ${entry.name}:`, error);
                            this.result.errors.push(entry.name);
                        }
                    } else {
                        this.result.skipped.push(entry.name);
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
        }
    }

    /**
     * Generate archive report
     */
    private async generateReport(archiveDir: string): Promise<void> {
        const reportContent = `# Archive Report
Generated: ${new Date().toISOString()}

## Configuration
- Max Age: ${this.config.maxAge} days
- Target Directory: ${this.config.targetDir}
- Archive Directory: ${path.basename(archiveDir)}
- Dry Run: ${this.config.dryRun}

## Summary
- Files Archived: ${this.result.archived.length}
- Files Skipped: ${this.result.skipped.length}
- Errors: ${this.result.errors.length}
- Total Size Archived: ${this.formatSize(this.result.totalSize)}

## Archived Files
${this.result.archived.length > 0 ? this.result.archived.map(f => `- ${f}`).join('\n') : 'No files archived'}

## Skipped Files (< ${this.config.maxAge} days old)
${this.result.skipped.length > 0 ? `${this.result.skipped.length} files were newer than ${this.config.maxAge} days` : 'No files skipped'}

## Errors
${this.result.errors.length > 0 ? this.result.errors.map(f => `- ${f}`).join('\n') : 'No errors encountered'}
`;

        const reportPath = this.config.dryRun 
            ? path.join(this.config.targetDir, 'archive-report-dry-run.md')
            : path.join(archiveDir, 'archive-report.md');

        if (!this.config.dryRun) {
            await writeFile(reportPath, reportContent);
            console.log(`\n📄 Report generated: ${path.basename(reportPath)}`);
        } else {
            console.log('\n[DRY RUN] Report would be generated');
        }

        // Also save to main directory for easy access
        const summaryPath = path.join(this.config.targetDir, 'last-archive-summary.md');
        if (!this.config.dryRun) {
            await writeFile(summaryPath, reportContent);
        }
    }

    /**
     * Main execution method
     */
    async execute(): Promise<ArchiveResult> {
        console.log('🗄️  Starting Archive Manager...');
        console.log(`📁 Target: ${this.config.targetDir}`);
        console.log(`⏰ Archiving files older than ${this.config.maxAge} days`);
        
        if (this.config.dryRun) {
            console.log('🔍 DRY RUN MODE - No files will be moved\n');
        } else {
            console.log('');
        }

        // Check if target directory exists
        if (!fs.existsSync(this.config.targetDir)) {
            console.error(`❌ Target directory does not exist: ${this.config.targetDir}`);
            return this.result;
        }

        // Create archive directory
        const archiveDir = await this.createTimestampedArchive();
        this.result.archiveDir = archiveDir;

        // Scan and archive files
        await this.scanDirectory(this.config.targetDir, archiveDir);

        // Generate report
        await this.generateReport(archiveDir);

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Archive Summary:');
        console.log(`  ✅ Archived: ${this.result.archived.length} files`);
        console.log(`  ⏭️  Skipped: ${this.result.skipped.length} files (too recent)`);
        console.log(`  💾 Total Size: ${this.formatSize(this.result.totalSize)}`);
        if (this.result.errors.length > 0) {
            console.log(`  ❌ Errors: ${this.result.errors.length}`);
        }
        console.log('='.repeat(50));

        return this.result;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const config: Partial<ArchiveConfig> = {};

    // Parse command line arguments
    if (args.includes('--dry-run')) {
        config.dryRun = true;
    }
    if (args.includes('--compress')) {
        config.compressJson = true;
    }
    
    const ageIndex = args.indexOf('--age');
    if (ageIndex !== -1 && args[ageIndex + 1]) {
        config.maxAge = parseInt(args[ageIndex + 1], 10);
    }

    const targetIndex = args.indexOf('--target');
    if (targetIndex !== -1 && args[targetIndex + 1]) {
        config.targetDir = path.resolve(args[targetIndex + 1]);
    }

    // Execute archival
    const manager = new ArchiveManager(config);
    manager.execute().catch(error => {
        console.error('❌ Archive failed:', error);
        process.exit(1);
    });
}

export { ArchiveManager, ArchiveConfig, ArchiveResult };