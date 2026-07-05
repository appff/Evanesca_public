# MiCA (Markets in Crypto-Assets) Regulation Constraints - EU Regulation 2023/1114
#
# Comprehensive constraint implementation for MiCA compliance monitoring.
# This file implements 15 constraints across High, Medium, and Additional priorities.
#
# Regulation Scope:
# - Title III (Authorisation and Supervision): Articles 59-62
# - Title IV (Obligations): Articles 63-90
# - Title V (Market Abuse): Articles 84-92
# - Title VI (Asset-Referenced Tokens): Articles 35-48
#
# Academic Foundation: MICA_REGULATION_ANALYSIS.md
# Temporal Implementation: Phase 0 (Temporal Window System)
# Dataset Generation: Phase 2 (Synthetic Data with KYC Metadata)
#
# Created: 2025-10-17 (Phase 1: MiCA Regulation Analysis and DSL Mapping)
# Updated: 2025-10-30 (Terminology Update: both → hybrid for pattern-based constraints)
#
# EVALUATION MODES:
# - "single": Individual edge evaluation (each edge evaluated independently)
# - "temporal": User-grouped temporal aggregation (requires sequential evaluation)
# - "hybrid": Can operate in either mode (pattern-based constraints)

# ============================================
# HIGH PRIORITY CONSTRAINTS (Regulatory Compliance Critical)
# ============================================

# Article 86: Large Transaction Reporting (EUR 1,000 threshold)
# Article 62: Institutional users are exempt from retail transaction limits
constraint MICA_LARGE_TRANSACTION {
  description: "MiCA Article 86 - Large transaction reporting (EUR 1,000+ must be reported to authorities)"
  evaluation_mode: "single"
  temporal: BLOCK_WINDOW(1)
  when: edge.value_usd > 0 && edge.source.participant.verification_status != "institutional"
  conditions: {
    let value_eur = edge.value_usd / 1.1
    return value_eur >= 1000
  }
  violation: value_eur >= 1000
  severity: "medium"
  confidence: 1.0
  message: "Large transaction detected - reporting required under MiCA Article 86"
}

# Article 63(5): Transaction Limits for Unverified Users
constraint MICA_UNVERIFIED_USER_LIMIT {
  description: "MiCA Article 63(5) - Unverified users limited to EUR 150 daily transactions"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(6500)
  when: edge.source.participant.verification_status == "unverified" && (edge.Action == "Swap" || edge.Action == "Transfer" || edge.Action == "Borrow" || edge.Action == "Deposit")
  conditions: {
    let user_txs_24h = edges.filter((e) => e.source == edge.source)
    let daily_volume_usd = user_txs_24h.sum((tx) => tx.value_usd)
    let daily_volume_eur = daily_volume_usd / 1.1
    return daily_volume_eur > 150
  }
  violation: daily_volume_eur > 150
  severity: "medium"
  confidence: 1.0
  message: "Unverified user exceeded EUR 150 daily limit"
}

# Article 63(5): Transaction Limits for Verified Users
constraint MICA_VERIFIED_USER_LIMIT {
  description: "MiCA Article 63(5) - Verified users limited to EUR 1,000 daily transactions"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(6500)
  when: edge.source.participant.verification_status == "verified" && (edge.Action == "Swap" || edge.Action == "Transfer" || edge.Action == "Borrow" || edge.Action == "Deposit")
  conditions: {
    let user_txs_24h = edges.filter((e) => e.source == edge.source)
    let daily_volume_usd = user_txs_24h.sum((tx) => tx.value_usd)
    let daily_volume_eur = daily_volume_usd / 1.1
    return daily_volume_eur > 1000
  }
  violation: daily_volume_eur > 1000
  severity: "medium"
  confidence: 1.0
  message: "Verified user exceeded EUR 1,000 daily limit"
}

# Article 84: Market Manipulation Prohibition (Wash Trading)
constraint MICA_WASH_TRADING_DETECTION {
  description: "MiCA Article 84 - Detect wash trading via coordinated trades between related accounts"
  evaluation_mode: "hybrid"
  temporal: TIME_WINDOW(3600)
  when: edge.Action == "Swap"
  conditions: {
    let related_accounts = edges.filter((e) => e.source.participant.beneficial_owner_id == edge.source.participant.beneficial_owner_id && e.source != edge.source)
    let wash_trades = related_accounts.filter((e) => e.asset_in == edge.asset_out && e.asset_out == edge.asset_in && Math.abs(e.value_usd - edge.value_usd) < edge.value_usd * 0.05 && Math.abs(e.block_number - edge.block_number) < 300)
    return wash_trades.length > 0
  }
  violation: wash_trades.length > 0
  severity: "critical"
  confidence: 0.90
  message: "Wash trading detected between related accounts"
}

# Article 35: Stablecoin Reserve Requirements (100% backing + 30% liquid)
constraint MICA_STABLECOIN_RESERVE_RATIO {
  description: "MiCA Article 35 - Stablecoin issuers must maintain 100% reserves + 30% liquid assets"
  evaluation_mode: "single"
  temporal: BLOCK_WINDOW(1)
  when: edge.destination.protocol_metadata != null && edge.destination.protocol_metadata.reserves_usd != null
  conditions: {
    let reserves = edge.destination.protocol_metadata.reserves_usd
    let circulating = edge.destination.protocol_metadata.circulating_supply_usd
    let liquid_reserves = edge.destination.protocol_metadata.liquid_reserves_usd
    let reserve_ratio = reserves / circulating
    let liquid_ratio = liquid_reserves / circulating
    return reserve_ratio < 1.0 || liquid_ratio < 0.3
  }
  violation: reserve_ratio < 1.0 || liquid_ratio < 0.3
  severity: "critical"
  confidence: 0.95
  message: "Stablecoin reserve requirements violated"
}

# ============================================
# MEDIUM PRIORITY CONSTRAINTS (Enhanced Monitoring)
# ============================================

# Article 77: AML Suspicious Pattern Detection (Structuring/Smurfing)
constraint MICA_STRUCTURING_DETECTION {
  description: "MiCA Article 77 - Detect structuring (splitting large amounts to evade limits)"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(300)
  when: edge.value_usd > 50 && edge.value_usd < 150
  conditions: {
    let user_txs = edges.filter((e) => e.source == edge.source)
    let suspicious_txs = user_txs.filter((e) => e.value_usd > 50 && e.value_usd < 150)
    let total_volume = suspicious_txs.sum((e) => e.value_usd)
    let avg_amount = total_volume / suspicious_txs.length
    let variance = suspicious_txs.map((e) => Math.abs(e.value_usd - avg_amount)).sum((v) => v) / suspicious_txs.length
    return suspicious_txs.length >= 3 && variance < 20 && total_volume > 150
  }
  violation: suspicious_txs.length >= 3 && variance < 20 && total_volume > 150
  severity: "high"
  confidence: 0.85
  message: "Potential structuring detected - multiple similar-amount transactions"
}

# Article 77: Rapid Asset Movement Detection (Layering)
constraint MICA_RAPID_MOVEMENT_LAYERING {
  description: "MiCA Article 77 - Detect rapid asset movement across addresses (layering)"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(50)
  when: edge.Action == "Transfer"
  conditions: {
    let dest_addr = edge.destination
    let next_hops = edges.filter((e) => e.Action == "Transfer" && e.source == dest_addr && e.block_number > edge.block_number)
    return next_hops.length >= 2
  }
  violation: next_hops.length >= 2
  severity: "medium"
  confidence: 0.75
  message: "Rapid asset movement through multiple addresses - potential layering"
}

# Article 89: Insider Trading Prohibition
constraint MICA_INSIDER_TRADING_PATTERN {
  description: "MiCA Article 89 - Detect potential insider trading via unusual pre-event activity"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(300)
  when: edge.Action == "Swap" && edge.value_usd > 1000
  conditions: {
    let user_txs = edges.filter((e) => e.source == edge.source && e.Action == "Swap" && e.block_number != edge.block_number)
    let historical_avg = user_txs.sum((e) => e.value_usd) / user_txs.length
    let size_ratio = edge.value_usd / historical_avg
    return user_txs.length > 0 && size_ratio > 5.0
  }
  violation: size_ratio > 5.0
  severity: "high"
  confidence: 0.70
  message: "Unusual trading activity - potential insider trading"
}

# Article 60: Geographic Restrictions (Jurisdiction-based)
constraint MICA_PROHIBITED_JURISDICTION {
  description: "MiCA Article 60 - Detect transactions from prohibited jurisdictions"
  evaluation_mode: "single"
  temporal: BLOCK_WINDOW(1)
  when: edge.source.participant.jurisdiction != null && (edge.Action == "Swap" || edge.Action == "Transfer" || edge.Action == "Borrow" || edge.Action == "Deposit")
  conditions: {
    let prohibited = ["KP", "IR", "SY", "MM", "CU", "VE", "BY"]
    let user_jurisdiction = edge.source.participant.jurisdiction
    return prohibited.indexOf(user_jurisdiction) >= 0
  }
  violation: prohibited.indexOf(user_jurisdiction) >= 0
  severity: "critical"
  confidence: 0.95
  message: "Transaction from prohibited jurisdiction"
}

# Article 60: Enhanced Due Diligence for High-Risk Jurisdictions
# Article 62: Institutional users are exempt (properly verified high-value entities)
constraint MICA_HIGH_RISK_JURISDICTION {
  description: "MiCA Article 60 - Enhanced due diligence for high-risk jurisdictions"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(6500)
  when: edge.source.participant.jurisdiction != null && edge.source.participant.risk_profile == "high" && edge.source.participant.verification_status != "institutional"
  conditions: {
    let high_risk = ["PK", "TR", "ZA", "PH", "YE", "UG"]
    let user_jurisdiction = edge.source.participant.jurisdiction
    let is_high_risk = high_risk.indexOf(user_jurisdiction) >= 0
    let user_txs_24h = edges.filter((e) => e.source == edge.source)
    let daily_volume = user_txs_24h.sum((e) => e.value_usd)
    return is_high_risk && daily_volume > 5000
  }
  violation: is_high_risk && daily_volume > 5000
  severity: "medium"
  confidence: 0.80
  message: "High-risk jurisdiction with significant activity - enhanced due diligence required"
}

# ============================================
# ADDITIONAL CONSTRAINTS (Comprehensive Monitoring)
# ============================================

# Article 84: Circular Trading Detection
constraint MICA_CIRCULAR_TRADING {
  description: "MiCA Article 84 - Detect circular trading patterns (A to B to C to A)"
  evaluation_mode: "hybrid"
  temporal: BLOCK_WINDOW(100)
  when: edge.Action == "Swap"
  conditions: {
    let start_asset = edge.asset_in
    let end_asset = edge.asset_out
    let chain_swaps = edges.filter((e) => e.Action == "Swap" && e.block_number > edge.block_number && e.source == edge.source && e.asset_in == end_asset)
    let circular = chain_swaps.filter((e) => e.asset_out == start_asset)
    return circular.length > 0
  }
  violation: circular.length > 0
  severity: "high"
  confidence: 0.85
  message: "Circular trading pattern detected - market manipulation"
}

# Article 77: Unusual Transaction Velocity
constraint MICA_UNUSUAL_VELOCITY {
  description: "MiCA Article 77 - Detect unusually high transaction velocity"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(100)
  when: edge.value_usd > 100
  conditions: {
    let user_txs = edges.filter((e) => e.source == edge.source)
    let tx_count = user_txs.length
    let blocks_span = window_end_block - window_start_block
    let velocity = tx_count / blocks_span
    return tx_count > 10 && velocity > 0.10
  }
  violation: tx_count > 10 && velocity > 0.10
  severity: "medium"
  confidence: 0.70
  message: "Unusually high transaction velocity - automated trading suspected"
}

# Article 77: Volume Spike Detection
constraint MICA_VOLUME_SPIKE {
  description: "MiCA Article 77 - Detect sudden volume spikes vs historical baseline"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(6500)
  when: edge.value_usd > 0
  conditions: {
    let user_txs = edges.filter((e) => e.source == edge.source)
    let recent_txs = user_txs.filter((e) => e.block_number > currentBlockNumber - 300)
    let recent_volume = recent_txs.sum((e) => e.value_usd)
    let total_volume = user_txs.sum((e) => e.value_usd)
    let avg_hourly = total_volume / 24
    return user_txs.length >= 5 && recent_volume > avg_hourly * 5
  }
  violation: user_txs.length >= 5 && recent_volume > avg_hourly * 5
  severity: "medium"
  confidence: 0.80
  message: "Volume spike detected - activity >5x historical average"
}

# Article 77: Cross-Chain Bridge Evasion
constraint MICA_BRIDGE_LIMIT_EVASION {
  description: "MiCA Article 77 - Detect limit evasion via cross-chain bridges"
  evaluation_mode: "temporal"
  temporal: BLOCK_WINDOW(6500)
  when: edge.Action == "Bridge" || edge.destination.protocol_type == "bridge"
  conditions: {
    let user_bridges = edges.filter((e) => e.source == edge.source && (e.Action == "Bridge" || e.destination.protocol_type == "bridge"))
    let bridge_volume = user_bridges.sum((e) => e.value_usd)
    let bridge_volume_eur = bridge_volume / 1.1
    return user_bridges.length >= 2 && bridge_volume_eur > 150
  }
  violation: user_bridges.length >= 2 && bridge_volume_eur > 150
  severity: "high"
  confidence: 0.85
  message: "Potential limit evasion via cross-chain bridges"
}

# Article 62: Institutional Verification
constraint MICA_INSTITUTIONAL_VERIFICATION {
  description: "MiCA Article 62 - Institutional users must be properly verified"
  evaluation_mode: "single"
  temporal: BLOCK_WINDOW(1)
  when: edge.value_usd > 10000 && edge.source.participant.verification_status != "institutional"
  conditions: {
    let is_large_tx = edge.value_usd > 10000
    let is_institutional = edge.source.participant.verification_status == "institutional"
    return is_large_tx && !is_institutional
  }
  violation: is_large_tx && !is_institutional
  severity: "medium"
  confidence: 0.75
  message: "Large transaction from non-institutional account - verification review required"
}

# ============================================
# IMPLEMENTATION NOTES
# ============================================
#
# 1. KYC/AML Integration:
#    - Requires edge.source.participant.verification_status from KYC system
#    - Requires edge.source.participant.beneficial_owner_id for related account detection
#    - Requires edge.source.participant.jurisdiction for geographic compliance
#    - Requires edge.source.participant.risk_profile for enhanced monitoring
#
# 2. Currency Conversion:
#    - All constraints use USD values (edge.value_usd)
#    - Runtime conversion to EUR: value_eur = value_usd / 1.1
#    - Production deployment requires real-time EUR/USD exchange rate oracle
#
# 3. Temporal Windows:
#    - BLOCK_WINDOW(6500) = ~24 hours (assuming 12s/block on Ethereum)
#    - BLOCK_WINDOW(300) = ~1 hour
#    - TIME_WINDOW(3600) = 1 hour (3600 seconds)
#    - Adjust based on actual blockchain block time
#
# 4. Confidence Scores:
#    - 1.0: High confidence, low false positive rate (transaction limits)
#    - 0.95: Very high confidence (reserve ratios, jurisdiction checks)
#    - 0.90: High confidence with minor FP risk (wash trading)
#    - 0.85: Good confidence, moderate FP risk (structuring, circular trading)
#    - 0.80: Moderate confidence (high-risk jurisdictions)
#    - 0.75: Lower confidence, requires manual review (layering, institutional)
#    - 0.70: Requires correlation with external data (insider trading, velocity)
#
# 5. Severity Levels:
#    - critical: Immediate action required (reserve violations, prohibited jurisdictions)
#    - high: Priority investigation (wash trading, structuring, bridge evasion)
#    - medium: Enhanced monitoring (transaction limits, velocity, volume spikes)
#
# 6. Performance:
#    - Larger temporal windows increase memory usage
#    - Buffer cleanup automatic (maxWindowSize configurable)
#    - Default buffer: 200 blocks (~40 minutes)
#
# 7. Reporting Requirements:
#    - critical severity: Immediate reporting required (<24h)
#    - high severity: Investigation + ESMA/national authority notification (<48h)
#    - medium severity: Enhanced monitoring + periodic reporting (<7 days)
