use anchor_lang::prelude::*;

// SOURCE-ONLY placeholder, generated from a public label, NOT a deployed program.
// Generate your own program keypair and run `anchor keys sync` before local testing.
declare_id!("EkxBFKArDyC7opXhFEFZc6knzvv6mkeDUNkGPGHWD4By");

#[program]
pub mod tallytrail {
    use super::*;

    // The business identity is a signer public key, never a freely editable name.
    // Period is YYYY-MM (calendar months only). `init` prevents duplicate PDAs.
    pub fn submit_report(ctx: Context<SubmitReport>, period: String, evidence_hash: [u8; 32], total_grams_co2e: u64) -> Result<()> {
        require!(valid_period(&period), TallyError::InvalidPeriod);
        require!(evidence_hash != [0; 32], TallyError::EmptyHash);
        let report = &mut ctx.accounts.report;
        report.business = ctx.accounts.business.key();
        report.period = period;
        report.evidence_hash = evidence_hash;
        report.total_grams_co2e = total_grams_co2e;
        report.bump = ctx.bumps.report;
        Ok(())
    }

    // Every registry owns its namespace: only that registry signer may attest.
    // serial_hash is SHA256 of the registry's canonical serial (32-byte seed).
    // This attests a registry claim; it cannot independently prove off-chain facts.
    pub fn retire_offset(ctx: Context<RetireOffset>, serial_hash: [u8; 32], grams_co2e: u64, beneficiary: Pubkey) -> Result<()> {
        require!(serial_hash != [0; 32], TallyError::EmptyHash);
        require!(grams_co2e > 0, TallyError::ZeroQuantity);
        let retirement = &mut ctx.accounts.retirement;
        retirement.registry = ctx.accounts.registry.key();
        retirement.serial_hash = serial_hash;
        retirement.grams_co2e = grams_co2e;
        retirement.beneficiary = beneficiary;
        retirement.bump = ctx.bumps.retirement;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(period: String)]
pub struct SubmitReport<'info> {
    #[account(mut)]
    pub business: Signer<'info>,
    #[account(init, payer = business, space = 8 + Report::INIT_SPACE,
        seeds = [b"report", business.key().as_ref(), period.as_bytes()], bump)]
    pub report: Account<'info, Report>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(serial_hash: [u8; 32])]
pub struct RetireOffset<'info> {
    #[account(mut)]
    pub registry: Signer<'info>,
    #[account(init, payer = registry, space = 8 + OffsetRetirement::INIT_SPACE,
        seeds = [b"offset", registry.key().as_ref(), serial_hash.as_ref()], bump)]
    pub retirement: Account<'info, OffsetRetirement>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Report {
    pub business: Pubkey,
    #[max_len(7)]
    pub period: String,
    pub evidence_hash: [u8; 32],
    pub total_grams_co2e: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OffsetRetirement {
    pub registry: Pubkey,
    pub serial_hash: [u8; 32],
    pub grams_co2e: u64,
    pub beneficiary: Pubkey,
    pub bump: u8,
}

fn valid_period(period: &str) -> bool {
    let bytes = period.as_bytes();
    if bytes.len() != 7 || !bytes[0..4].iter().all(u8::is_ascii_digit)
        || bytes[4] != b'-' || !bytes[5..7].iter().all(u8::is_ascii_digit) {
        return false;
    }
    let month = (bytes[5] - b'0') * 10 + bytes[6] - b'0';
    &bytes[0..4] != b"0000" && month >= 1 && month <= 12
}

#[error_code]
pub enum TallyError {
    #[msg("Period must be YYYY-MM with month 01-12 and year 0001-9999")]
    InvalidPeriod,
    #[msg("Hash cannot be zero")]
    EmptyHash,
    #[msg("Retirement must have positive quantity")]
    ZeroQuantity,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_calendar_period() {
        assert!(valid_period("2026-09"));
        for bad in ["2026-00", "2026-13", "0000-01", "26-09", "2026-1", "../evil", "２０２６-０９"] {
            assert!(!valid_period(bad));
        }
    }
}
