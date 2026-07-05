// PrecisionMath - BigInt 기반 정확한 수치 계산 유틸리티
import { DebugLogger } from "./DebugLogger";

export class PrecisionMath {
  
  /**
   * String을 BigInt로 안전하게 변환
   * Scientific notation 지원
   */
  static stringToBigInt(value: string): bigint {
    if (!value || value === '0') return 0n;
    
    // Scientific notation 처리 - Number precision 한계 회피
    if (value.includes('e') || value.includes('E')) {
      const numValue = parseFloat(value);
      if (numValue > Number.MAX_SAFE_INTEGER) {
        // 매우 큰 수는 fallback으로 직접 처리
        DebugLogger.price(`⚠️ [PrecisionMath] Scientific notation exceeds safe range: ${value}`);
        return 0n; // fallback으로 0 반환 (후에 parseFloat로 처리됨)
      }
      return BigInt(Math.floor(numValue));
    }
    
    // 일반 문자열 처리
    const cleanValue = value.split('.')[0]; // 소수점 제거 (정수 부분만)
    return BigInt(cleanValue);
  }
  
  /**
   * String 값이 0보다 큰지 확인
   */
  static isGreaterThanZero(value: string): boolean {
    try {
      return this.stringToBigInt(value) > 0n;
    } catch (e) {
      return parseFloat(value) > 0;
    }
  }
  
  /**
   * 두 string 값 비교 (a > b)
   */
  static isGreaterThan(a: string, b: string): boolean {
    try {
      return this.stringToBigInt(a) > this.stringToBigInt(b);
    } catch (e) {
      return parseFloat(a) > parseFloat(b);
    }
  }
  
  /**
   * 두 string 값이 같은지 확인
   */
  static isEqual(a: string, b: string): boolean {
    try {
      return this.stringToBigInt(a) === this.stringToBigInt(b);
    } catch (e) {
      return parseFloat(a) === parseFloat(b);
    }
  }
  
  /**
   * String 값이 0인지 확인
   */
  static isZero(value: string): boolean {
    return this.isEqual(value, '0');
  }
  
  /**
   * Decimal 적용해서 정규화 (BigInt 기반)
   */
  static normalizeAmount(rawAmount: string, decimals: number): number {
    try {
      const bigAmount = this.stringToBigInt(rawAmount);
      const divisor = BigInt(Math.pow(10, decimals));
      
      // 정수 부분
      const integerPart = bigAmount / divisor;
      
      // 소수 부분 (나머지)
      const remainder = bigAmount % divisor;
      const fractionalPart = Number(remainder) / Math.pow(10, decimals);
      
      return Number(integerPart) + fractionalPart;
    } catch (e) {
      // Fallback: parseFloat 사용
      return parseFloat(rawAmount) / Math.pow(10, decimals);
    }
  }
  
  /**
   * BigInt를 ETH 단위로 변환 (18 decimals)
   */
  static weiToEth(weiAmount: string): number {
    return this.normalizeAmount(weiAmount, 18);
  }
  
  /**
   * BigInt를 WBTC 단위로 변환 (8 decimals) 
   */
  static satoshiToWBTC(satoshiAmount: string): number {
    return this.normalizeAmount(satoshiAmount, 8);
  }
  
  /**
   * 값이 안전한 범위인지 확인
   */
  static isSafeNumber(value: string): boolean {
    try {
      const numValue = parseFloat(value);
      return numValue <= Number.MAX_SAFE_INTEGER;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * 디버그용: 값의 크기와 타입 정보 반환
   */
  static getValueInfo(value: string, label: string = ""): string {
    try {
      const bigIntValue = this.stringToBigInt(value);
      const isSafe = this.isSafeNumber(value);
      const hasScientific = value.includes('e') || value.includes('E');
      
      return `${label} ${value} (BigInt: ${bigIntValue}, Safe: ${isSafe}, Scientific: ${hasScientific})`;
    } catch (e) {
      return `${label} ${value} (Error: ${e})`;
    }
  }
} 