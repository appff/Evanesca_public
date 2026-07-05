# Large-scale evaluation constraints extracted from default_constraints.dsl

# ============================================
# Core DEX/AMM Constraints
# ============================================

constraint DEX_K_INVARIANT {
  when: edge.Type == "DEX" && edge.Action == "Swap"
  condition: {
    k_ratio: edge.k_after / edge.k_before
  }
  violation: edge.k_before > 0 && edge.k_after > 0 && (k_ratio > 1.01 || k_ratio < 0.99)
  message: "D1: K-invariant violation detected in AMM"
}

constraint UNIFIED_PRICE_MANIPULATION {
  when: edge.Type == "DEX" && edge.Action == "Swap"
  condition: {
    swap_ratio: (edge.totalOutUSD / edge.totalInUSD) * 100,
    concentrated_liquidity: edge.is_concentrated_liquidity == true,
    gamma_service: edge.Service == "gammahypervisor",
    profit_threshold: edge.profit_usd > 100000
  }
  violation: (edge.totalOutUSD > 0 && edge.totalInUSD > 0 && swap_ratio > 105) || (concentrated_liquidity && profit_threshold) || gamma_service
  message: "D2: Price manipulation via abnormal swap detected"
}

# ============================================
# Core Lending Constraints
# ============================================

constraint COLLATERAL_MANIPULATION {
  when: edge.Type == "Lending" && (edge.Action == "Borrow" || edge.Action == "Withdraw" || edge.Action == "Redeem")
  condition: {
    profit_check: edge.totalOutUSD > edge.totalInUSD * 1.3,
    is_hundred: edge.Service == "HundredFinance" || edge.Service == "hundredfinance"
  }
  violation: (edge.user_balance < 0 && edge.user_collateral > 0) || (is_hundred && profit_check && edge.totalInUSD > 0)
  message: "L1: Collateral manipulation - improper withdrawal/borrow detected"
}

constraint LENDING_EXCESSIVE_BORROW {
  when: edge.Type == "Lending" && edge.Action == "Borrow"
  condition: {
    borrow_percent: (edge.borrow_available / edge.borrow_amount_usd) * 100
  }
  violation: edge.borrow_amount_usd > 0 && borrow_percent < 10
  message: "L2: Excessive borrowing detected"
}

# ============================================
# Flash Loan Detection
# ============================================

constraint UNIFIED_FLASH_LOAN {
  when: edge.Action == "FlashLoan" || (edge.Type == "Lending" && edge.Action == "Borrow")
  condition: {}
  violation: edge.loan_amount > 1000000 || edge.is_flash_loan == true
  message: "Flash loan pattern detected"
}
