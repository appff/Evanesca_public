/**
 * SemanticModelValidator - Validates semantic model completeness and consistency
 */

import { SemanticModel } from '../SemanticFinancialGraph/SemanticFinancialGraphUtils';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    statistics: {
        totalServices: number;
        totalAddresses: number;
        totalEvents: number;
        servicesWithMissingActions: number;
        eventsWithoutActions: number;
    };
}

export class SemanticModelValidator {
    private semanticModels: SemanticModel[];

    constructor() {
        // Load semantic models
        const modelPath = path.join(__dirname, '../jsons/semanticModel.json');
        this.semanticModels = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    }

    /**
     * Validate the entire semantic model
     */
    validate(): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            statistics: {
                totalServices: 0,
                totalAddresses: 0,
                totalEvents: 0,
                servicesWithMissingActions: 0,
                eventsWithoutActions: 0
            }
        };

        for (const model of this.semanticModels) {
            this.validateModel(model, result);
        }

        result.isValid = result.errors.length === 0;
        return result;
    }

    /**
     * Validate a single semantic model entry
     */
    private validateModel(model: SemanticModel, result: ValidationResult): void {
        result.statistics.totalServices++;
        result.statistics.totalAddresses += model.Address.length;

        // Check if service has required fields
        if (!model.Service) {
            result.errors.push(`Missing Service name in model`);
        }

        if (!model.ServiceType) {
            result.errors.push(`Missing ServiceType for ${model.Service}`);
        }

        // Validate events have corresponding actions
        if (model.Events && Array.isArray(model.Events)) {
            result.statistics.totalEvents += model.Events.length;
            
            let hasActionMissing = false;
            for (const eventName of model.Events) {
                // Skip non-financial events that shouldn't have actions
                if (this.isNonFinancialEvent(eventName)) {
                    result.warnings.push(
                        `${model.Service}: Non-financial event '${eventName}' in Events array (consider removing)`
                    );
                    continue;
                }

                // Check if action exists for this event
                const hasAction = this.hasActionForEvent(model, eventName);
                if (!hasAction) {
                    result.errors.push(
                        `${model.Service}: Event '${eventName}' has no corresponding action definition`
                    );
                    hasActionMissing = true;
                    result.statistics.eventsWithoutActions++;
                }
            }

            if (hasActionMissing) {
                result.statistics.servicesWithMissingActions++;
            }
        }

        // Check for duplicate addresses
        const uniqueAddresses = new Set(model.Address);
        if (uniqueAddresses.size !== model.Address.length) {
            result.warnings.push(
                `${model.Service}: Contains duplicate addresses`
            );
        }

        // Validate address format
        for (const address of model.Address) {
            if (!this.isValidAddress(address)) {
                result.errors.push(
                    `${model.Service}: Invalid address format: ${address}`
                );
            }
        }
    }

    /**
     * Check if an event is non-financial
     */
    private isNonFinancialEvent(eventName: string): boolean {
        const nonFinancialEvents = ['Transfer', 'Approval', 'Sync', 'AccrueInterest'];
        return nonFinancialEvents.includes(eventName);
    }

    /**
     * Check if model has an action for the given event
     */
    private hasActionForEvent(model: SemanticModel, eventName: string): boolean {
        // Direct event name match
        if (model[eventName as keyof SemanticModel]) {
            return true;
        }

        // Check standard action mappings
        const actionMappings: { [key: string]: string[] } = {
            'Mint': ['Deposit'],
            'Redeem': ['Withdraw'],
            'RepayBorrow': ['Repay'],
            'LiquidateBorrow': ['Repay'],
            'Swap': ['Swap', 'TokenExchange'],
            'TokenExchange': ['Swap', 'TokenExchange'],
            'TokenPurchase': ['Swap'],
            'EthPurchase': ['Swap'],
            'AddLiquidity': ['AddLiquidity'],
            'RemoveLiquidity': ['RemoveLiquidity'],
            'Borrow': ['Borrow'],
            'Deposit': ['Deposit'],
            'Withdraw': ['Withdraw'],
            'Repay': ['Repay'],
            'FlashLoan': ['FlashLoan']
        };

        const possibleActions = actionMappings[eventName];
        if (possibleActions) {
            for (const action of possibleActions) {
                if (model[action as keyof SemanticModel]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Validate Ethereum address format
     */
    private isValidAddress(address: string): boolean {
        if (typeof address !== 'string') return false;
        if (address === '') return true; // Empty array entries are allowed
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Print validation report
     */
    printReport(result: ValidationResult): void {
        console.log('\n📋 Semantic Model Validation Report');
        console.log('=' .repeat(50));
        
        console.log('\n📊 Statistics:');
        console.log(`   Total Services: ${result.statistics.totalServices}`);
        console.log(`   Total Addresses: ${result.statistics.totalAddresses}`);
        console.log(`   Total Events: ${result.statistics.totalEvents}`);
        console.log(`   Services with Missing Actions: ${result.statistics.servicesWithMissingActions}`);
        console.log(`   Events without Actions: ${result.statistics.eventsWithoutActions}`);

        if (result.errors.length > 0) {
            console.log('\n❌ Errors:');
            for (const error of result.errors.slice(0, 10)) {
                console.log(`   - ${error}`);
            }
            if (result.errors.length > 10) {
                console.log(`   ... and ${result.errors.length - 10} more errors`);
            }
        }

        if (result.warnings.length > 0) {
            console.log('\n⚠️ Warnings:');
            for (const warning of result.warnings.slice(0, 10)) {
                console.log(`   - ${warning}`);
            }
            if (result.warnings.length > 10) {
                console.log(`   ... and ${result.warnings.length - 10} more warnings`);
            }
        }

        console.log('\n' + '=' .repeat(50));
        console.log(result.isValid ? '✅ Validation PASSED' : '❌ Validation FAILED');
    }
}

// Run validation if executed directly
if (require.main === module) {
    const validator = new SemanticModelValidator();
    const result = validator.validate();
    validator.printReport(result);
    process.exit(result.isValid ? 0 : 1);
}