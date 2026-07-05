/**
 * Performance Profiler for identifying bottlenecks in transaction processing
 */

export class PerformanceProfiler {
    private timers: Map<string, number> = new Map();
    private results: Map<string, number[]> = new Map();
    private enabled: boolean = false;

    constructor(enabled: boolean = false) {
        this.enabled = enabled;
    }

    enable(): void {
        this.enabled = true;
        console.log('🔍 Performance profiling enabled');
    }

    disable(): void {
        this.enabled = false;
    }

    start(label: string): void {
        if (!this.enabled) return;
        this.timers.set(label, performance.now());
    }

    end(label: string): number {
        if (!this.enabled) return 0;
        
        const startTime = this.timers.get(label);
        if (startTime === undefined) {
            console.warn(`⚠️ Performance timer '${label}' was not started`);
            return 0;
        }

        const duration = performance.now() - startTime;
        this.timers.delete(label);

        // Store result for analysis
        if (!this.results.has(label)) {
            this.results.set(label, []);
        }
        this.results.get(label)!.push(duration);

        return duration;
    }

    measure<T>(label: string, fn: () => T): T;
    measure<T>(label: string, fn: () => Promise<T>): Promise<T>;
    measure<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
        if (!this.enabled) return fn();

        this.start(label);
        try {
            const result = fn();
            if (result instanceof Promise) {
                return result.finally(() => {
                    const duration = this.end(label);
                    console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
                });
            } else {
                const duration = this.end(label);
                console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
                return result;
            }
        } catch (error) {
            this.end(label);
            throw error;
        }
    }

    getResults(): Map<string, number[]> {
        return new Map(this.results);
    }

    getAverages(): Map<string, number> {
        const averages = new Map<string, number>();
        for (const [label, times] of this.results) {
            const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
            averages.set(label, avg);
        }
        return averages;
    }

    printReport(): void {
        if (!this.enabled) return;

        console.log('\n' + '='.repeat(60));
        console.log('📊 PERFORMANCE PROFILING REPORT');
        console.log('='.repeat(60));

        const averages = this.getAverages();
        const sortedResults = Array.from(averages.entries())
            .sort((a, b) => b[1] - a[1]); // Sort by duration desc

        let totalTime = 0;
        for (const [label, avgTime] of sortedResults) {
            const count = this.results.get(label)?.length || 0;
            const totalForLabel = this.results.get(label)?.reduce((sum, time) => sum + time, 0) || 0;
            
            console.log(`📈 ${label}:`);
            console.log(`   Average: ${avgTime.toFixed(2)}ms`);
            console.log(`   Count: ${count} calls`);
            console.log(`   Total: ${totalForLabel.toFixed(2)}ms`);
            console.log('');
            
            totalTime += totalForLabel;
        }

        console.log(`⏱️  Total Measured Time: ${totalTime.toFixed(2)}ms`);
        console.log('='.repeat(60));
    }

    clear(): void {
        this.timers.clear();
        this.results.clear();
    }
}

// Global profiler instance
export const globalProfiler = new PerformanceProfiler();

// Enable profiling if environment variable is set
if (process.env.ENABLE_PROFILING === 'true') {
    globalProfiler.enable();
}