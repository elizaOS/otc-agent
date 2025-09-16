#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("EPqRoaDur9VtTKABWK3QQArV2wCYKoN3Zu8kErhrtUxp");

#[event]
pub struct OfferCreated {
    pub desk: Pubkey,
    pub offer: Pubkey,
    pub beneficiary: Pubkey,
    pub token_amount: u64,
    pub discount_bps: u16,
    pub currency: u8,
}

#[event]
pub struct OfferApproved { pub offer: Pubkey, pub approver: Pubkey }

#[event]
pub struct OfferCancelled { pub offer: Pubkey, pub by: Pubkey }

#[event]
pub struct OfferPaid { pub offer: Pubkey, pub payer: Pubkey, pub amount: u64, pub currency: u8 }

#[event]
pub struct TokensClaimed { pub offer: Pubkey, pub beneficiary: Pubkey, pub amount: u64 }

#[event]
pub struct LimitsUpdated { pub min_usd_amount_8d: u64, pub max_token_per_order: u64, pub quote_expiry_secs: i64, pub default_unlock_delay_secs: i64, pub max_lockup_secs: i64 }

#[event]
pub struct PricesUpdated { pub token_usd_8d: u64, pub sol_usd_8d: u64, pub updated_at: i64, pub max_age: i64 }

#[event]
pub struct RestrictFulfillUpdated { pub enabled: bool }

#[event]
pub struct Paused { pub paused: bool }

#[allow(deprecated)]
#[program]
pub mod otc {
    use super::*;

    pub fn init_desk(
        ctx: Context<InitDesk>,
        min_usd_amount_8d: u64,
        max_token_per_order: u64,
        quote_expiry_secs: i64,
        default_unlock_delay_secs: i64,
        max_lockup_secs: i64,
    ) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        desk.owner = ctx.accounts.owner.key();
        desk.agent = ctx.accounts.agent.key();
        desk.token_mint = ctx.accounts.token_mint.key();
        desk.usdc_mint = ctx.accounts.usdc_mint.key();
        desk.token_decimals = ctx.accounts.token_mint.decimals;
        desk.usdc_decimals = ctx.accounts.usdc_mint.decimals;
        require!(desk.usdc_decimals == 6, OtcError::UsdcDecimals);
        desk.min_usd_amount_8d = min_usd_amount_8d;
        desk.max_token_per_order = max_token_per_order;
        desk.quote_expiry_secs = quote_expiry_secs;
        desk.default_unlock_delay_secs = default_unlock_delay_secs;
        desk.max_lockup_secs = max_lockup_secs;
        desk.max_price_age_secs = 3600;
        desk.restrict_fulfill = false;
        desk.token_deposited = 0;
        desk.token_reserved = 0;
        desk.next_offer_id = 1;
        desk.token_usd_price_8d = 0;
        desk.sol_usd_price_8d = 0;
        desk.prices_updated_at = 0;
        Ok(())
    }

    pub fn set_prices(ctx: Context<OnlyOwnerDesk>, token_usd_8d: u64, sol_usd_8d: u64, updated_at: i64, max_age: i64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        desk.token_usd_price_8d = token_usd_8d;
        desk.sol_usd_price_8d = sol_usd_8d;
        desk.prices_updated_at = updated_at;
        desk.max_price_age_secs = max_age;
        emit!(PricesUpdated { token_usd_8d, sol_usd_8d, updated_at, max_age });
        Ok(())
    }

    pub fn set_limits(ctx: Context<OnlyOwnerDesk>, min_usd_amount_8d: u64, max_token_per_order: u64, quote_expiry_secs: i64, default_unlock_delay_secs: i64, max_lockup_secs: i64) -> Result<()> {
        require!(min_usd_amount_8d > 0, OtcError::AmountRange);
        require!(max_token_per_order > 0, OtcError::AmountRange);
        require!(quote_expiry_secs > 0, OtcError::AmountRange);
        require!(max_lockup_secs >= 0, OtcError::AmountRange);
        require!(default_unlock_delay_secs >= 0 && default_unlock_delay_secs <= max_lockup_secs, OtcError::AmountRange);
        let desk = &mut ctx.accounts.desk;
        desk.min_usd_amount_8d = min_usd_amount_8d;
        desk.max_token_per_order = max_token_per_order;
        desk.quote_expiry_secs = quote_expiry_secs;
        desk.default_unlock_delay_secs = default_unlock_delay_secs;
        desk.max_lockup_secs = max_lockup_secs;
        emit!(LimitsUpdated { min_usd_amount_8d, max_token_per_order, quote_expiry_secs, default_unlock_delay_secs, max_lockup_secs });
        Ok(())
    }

    pub fn set_agent(ctx: Context<OnlyOwnerDesk>, new_agent: Pubkey) -> Result<()> {
        ctx.accounts.desk.agent = new_agent;
        Ok(())
    }

    pub fn set_restrict_fulfill(ctx: Context<OnlyOwnerDesk>, enabled: bool) -> Result<()> {
        ctx.accounts.desk.restrict_fulfill = enabled;
        emit!(RestrictFulfillUpdated { enabled });
        Ok(())
    }

    pub fn pause(ctx: Context<OnlyOwnerDesk>) -> Result<()> {
        ctx.accounts.desk.paused = true;
        emit!(Paused { paused: true });
        Ok(())
    }

    pub fn unpause(ctx: Context<OnlyOwnerDesk>) -> Result<()> {
        ctx.accounts.desk.paused = false;
        emit!(Paused { paused: false });
        Ok(())
    }

    pub fn set_approver(ctx: Context<OnlyOwnerDesk>, who: Pubkey, allowed: bool) -> Result<()> {
        let approvers = &mut ctx.accounts.desk.approvers;
        if allowed {
            if !approvers.contains(&who) {
                require!(approvers.len() < 32, OtcError::TooManyApprovers);
                approvers.push(who);
            }
        } else if let Some(i) = approvers.iter().position(|x| *x == who) { approvers.remove(i); }
        Ok(())
    }

    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.desk.paused, OtcError::Paused);
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.owner_token_ata.to_account_info(),
            to: ctx.accounts.desk_token_treasury.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        ctx.accounts.desk.token_deposited = ctx.accounts.desk.token_deposited.checked_add(amount).ok_or(OtcError::Overflow)?;
        Ok(())
    }

    pub fn create_offer(ctx: Context<CreateOffer>, offer_id: u64, token_amount: u64, discount_bps: u16, currency: u8, lockup_secs: i64) -> Result<()> {
        msg!("enter create_offer");
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        require!(currency == 0 || currency == 1, OtcError::UnsupportedCurrency);
        require!(token_amount > 0 && token_amount <= desk.max_token_per_order, OtcError::AmountRange);
        require!(discount_bps <= 2500, OtcError::Discount);
        let now = Clock::get()?.unix_timestamp;
        if desk.prices_updated_at > 0 { require!(now - desk.prices_updated_at <= desk.max_price_age_secs, OtcError::StalePrice); }
        let price_8d = desk.token_usd_price_8d; require!(price_8d > 0, OtcError::NoPrice);
        let total_usd_8d = mul_div_u128(token_amount as u128, price_8d as u128, pow10(desk.token_decimals as u32) as u128)? as u64;
        let total_usd_disc = total_usd_8d.checked_mul((10_000 - discount_bps as u64) as u64).ok_or(OtcError::Overflow)?.checked_div(10_000).ok_or(OtcError::Overflow)?;
        require!(total_usd_disc >= desk.min_usd_amount_8d, OtcError::MinUsd);
        let available = available_inventory(desk, ctx.accounts.desk_token_treasury.amount);
        require!(available >= token_amount, OtcError::InsuffInv);

        require!(offer_id == desk.next_offer_id, OtcError::BadState);
        let id = offer_id; desk.next_offer_id = desk.next_offer_id.checked_add(1).ok_or(OtcError::Overflow)?;
        let offer_key = ctx.accounts.offer.key();
        let offer = &mut ctx.accounts.offer;
        offer.desk = desk.key();
        offer.id = id;
        offer.beneficiary = ctx.accounts.beneficiary.key();
        offer.token_amount = token_amount;
        offer.discount_bps = discount_bps;
        offer.created_at = now;
        let lockup = if lockup_secs > 0 { lockup_secs } else { desk.default_unlock_delay_secs };
        require!(lockup <= desk.max_lockup_secs, OtcError::LockupTooLong);
        offer.unlock_time = now + lockup;
        offer.price_usd_per_token_8d = price_8d;
        offer.sol_usd_price_8d = if currency == 0 { desk.sol_usd_price_8d } else { 0 };
        offer.currency = currency; // 0 SOL, 1 USDC
        offer.approved = false; offer.paid = false; offer.fulfilled = false; offer.cancelled = false; offer.payer = Pubkey::default(); offer.amount_paid = 0;
        emit!(OfferCreated { desk: offer.desk, offer: offer_key, beneficiary: offer.beneficiary, token_amount, discount_bps, currency });
        Ok(())
    }

    pub fn approve_offer(ctx: Context<ApproveOffer>, _offer_id: u64) -> Result<()> {
        let desk = &ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        validate_offer_pda(&desk.key(), &ctx.accounts.offer.key(), ctx.accounts.offer.id)?;
        must_be_approver(desk, &ctx.accounts.approver.key())?;
        let offer = &mut ctx.accounts.offer;
        require!(!offer.cancelled && !offer.paid, OtcError::BadState);
        require!(!offer.approved, OtcError::AlreadyApproved);
        offer.approved = true;
        emit!(OfferApproved { offer: ctx.accounts.offer.key(), approver: ctx.accounts.approver.key() });
        Ok(())
    }

    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let desk = &ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        validate_offer_pda(&desk.key(), &ctx.accounts.offer.key(), ctx.accounts.offer.id)?;
        let offer = &mut ctx.accounts.offer;
        require!(!offer.paid && !offer.fulfilled, OtcError::BadState);
        let caller = ctx.accounts.caller.key();
        let now = Clock::get()?.unix_timestamp;
        if caller == offer.beneficiary {
            require!(now >= offer.created_at + desk.quote_expiry_secs, OtcError::NotExpired);
        } else if caller == desk.owner || caller == desk.agent || desk.approvers.contains(&caller) {
        } else {
            return err!(OtcError::NotApprover);
        }
        offer.cancelled = true;
        emit!(OfferCancelled { offer: ctx.accounts.offer.key(), by: caller });
        Ok(())
    }

    pub fn fulfill_offer_usdc(ctx: Context<FulfillOfferUsdc>, _offer_id: u64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        validate_offer_pda(&desk.key(), &ctx.accounts.offer.key(), ctx.accounts.offer.id)?;
        let offer = &mut ctx.accounts.offer;
        require!(offer.approved, OtcError::NotApproved);
        require!(!offer.cancelled && !offer.paid && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp; require!(now <= offer.created_at + desk.quote_expiry_secs, OtcError::Expired);
        let available = available_inventory(desk, ctx.accounts.desk_token_treasury.amount); require!(available >= offer.token_amount, OtcError::InsuffInv);
        if desk.restrict_fulfill {
            let caller = ctx.accounts.payer.key();
            require!(caller == offer.beneficiary || caller == desk.owner || caller == desk.agent || desk.approvers.contains(&caller), OtcError::FulfillRestricted);
        }
        let price_8d = offer.price_usd_per_token_8d; let token_dec = desk.token_decimals as u32;
        let mut usd_8d = mul_div_u128(offer.token_amount as u128, price_8d as u128, pow10(token_dec) as u128)? as u64;
        usd_8d = usd_8d.checked_mul((10_000 - offer.discount_bps as u64) as u64).ok_or(OtcError::Overflow)?.checked_div(10_000).ok_or(OtcError::Overflow)?;
        let usdc_amount = mul_div_ceil_u128(usd_8d as u128, 1_000_000u128, 100_000_000u128)? as u64;
        let cpi_accounts = SplTransfer { from: ctx.accounts.payer_usdc_ata.to_account_info(), to: ctx.accounts.desk_usdc_treasury.to_account_info(), authority: ctx.accounts.payer.to_account_info() };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, usdc_amount)?;
        offer.amount_paid = usdc_amount; offer.payer = ctx.accounts.payer.key(); offer.paid = true;
        desk.token_reserved = desk.token_reserved.checked_add(offer.token_amount).ok_or(OtcError::Overflow)?;
        emit!(OfferPaid { offer: ctx.accounts.offer.key(), payer: ctx.accounts.payer.key(), amount: usdc_amount, currency: 1 });
        Ok(())
    }

    pub fn fulfill_offer_sol(ctx: Context<FulfillOfferSol>, _offer_id: u64) -> Result<()> {
        let desk_ai = ctx.accounts.desk.to_account_info();
        let desk_key = desk_ai.key();
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        validate_offer_pda(&desk.key(), &ctx.accounts.offer.key(), ctx.accounts.offer.id)?;
        let offer = &mut ctx.accounts.offer;
        require!(offer.approved, OtcError::NotApproved);
        require!(!offer.cancelled && !offer.paid && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp; require!(now <= offer.created_at + desk.quote_expiry_secs, OtcError::Expired);
        let available = available_inventory(desk, ctx.accounts.desk_token_treasury.amount); require!(available >= offer.token_amount, OtcError::InsuffInv);
        if desk.restrict_fulfill {
            let caller = ctx.accounts.payer.key();
            require!(caller == offer.beneficiary || caller == desk.owner || caller == desk.agent || desk.approvers.contains(&caller), OtcError::FulfillRestricted);
        }
        let price_8d = offer.price_usd_per_token_8d; let token_dec = desk.token_decimals as u32;
        let mut usd_8d = mul_div_u128(offer.token_amount as u128, price_8d as u128, pow10(token_dec) as u128)? as u64;
        usd_8d = usd_8d.checked_mul((10_000 - offer.discount_bps as u64) as u64).ok_or(OtcError::Overflow)?.checked_div(10_000).ok_or(OtcError::Overflow)?;
        let sol_usd = if offer.sol_usd_price_8d > 0 { offer.sol_usd_price_8d } else { desk.sol_usd_price_8d };
        require!(sol_usd > 0, OtcError::NoPrice);
        let lamports_req = mul_div_ceil_u128(usd_8d as u128, 1_000_000_000u128, sol_usd as u128)? as u64;
        let ix = anchor_lang::solana_program::system_instruction::transfer(&ctx.accounts.payer.key(), &desk_key, lamports_req);
        anchor_lang::solana_program::program::invoke(&ix, &[
            ctx.accounts.payer.to_account_info(),
            desk_ai,
            ctx.accounts.system_program.to_account_info(),
        ])?;
        offer.amount_paid = lamports_req; offer.payer = ctx.accounts.payer.key(); offer.paid = true;
        desk.token_reserved = desk.token_reserved.checked_add(offer.token_amount).ok_or(OtcError::Overflow)?;
        emit!(OfferPaid { offer: ctx.accounts.offer.key(), payer: ctx.accounts.payer.key(), amount: lamports_req, currency: 0 });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, _offer_id: u64) -> Result<()> {
        let desk_ai = ctx.accounts.desk.to_account_info();
        let desk_key = desk_ai.key();
        let desk_owner = ctx.accounts.desk.owner;
        let (expected, bump) = Pubkey::find_program_address(&[b"desk", desk_owner.as_ref()], &crate::ID);
        require!(expected == desk_key, OtcError::NotOwner);
        validate_offer_pda(&desk_key, &ctx.accounts.offer.key(), ctx.accounts.offer.id)?;
        let bump_bytes = [bump];
        let seeds: [&[u8]; 3] = [b"desk", desk_owner.as_ref(), &bump_bytes];
        let signer_seeds: &[&[&[u8]]] = &[&seeds];
        let paused = ctx.accounts.desk.paused;
        require!(!paused, OtcError::Paused);
        let offer_key = ctx.accounts.offer.key();
        let offer = &mut ctx.accounts.offer;
        require!(ctx.accounts.beneficiary.key() == offer.beneficiary, OtcError::NotOwner);
        require!(offer.paid && !offer.cancelled && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp; require!(now >= offer.unlock_time, OtcError::Locked);
        let cpi_accounts = SplTransfer { from: ctx.accounts.desk_token_treasury.to_account_info(), to: ctx.accounts.beneficiary_token_ata.to_account_info(), authority: desk_ai };
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, offer.token_amount)?;
        let desk_mut = &mut ctx.accounts.desk;
        desk_mut.token_reserved = desk_mut.token_reserved.checked_sub(offer.token_amount).ok_or(OtcError::Overflow)?;
        offer.fulfilled = true;
        emit!(TokensClaimed { offer: offer_key, beneficiary: offer.beneficiary, amount: offer.token_amount });
        Ok(())
    }

    pub fn withdraw_tokens(ctx: Context<WithdrawTokens>, amount: u64) -> Result<()> {
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        let desk_ai = ctx.accounts.desk.to_account_info();
        let (expected, bump) = Pubkey::find_program_address(&[b"desk", ctx.accounts.desk.owner.as_ref()], &crate::ID);
        require!(expected == ctx.accounts.desk.key(), OtcError::NotOwner);
        let bump_bytes = [bump];
        let seeds: [&[u8]; 3] = [b"desk", ctx.accounts.desk.owner.as_ref(), &bump_bytes];
        let signer_seeds: &[&[&[u8]]] = &[&seeds];
        let cpi_accounts = SplTransfer { from: ctx.accounts.desk_token_treasury.to_account_info(), to: ctx.accounts.owner_token_ata.to_account_info(), authority: desk_ai };
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn withdraw_usdc(ctx: Context<WithdrawUsdc>, amount: u64) -> Result<()> {
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        let desk_ai = ctx.accounts.desk.to_account_info();
        let (expected, bump) = Pubkey::find_program_address(&[b"desk", ctx.accounts.desk.owner.as_ref()], &crate::ID);
        require!(expected == ctx.accounts.desk.key(), OtcError::NotOwner);
        let bump_bytes = [bump];
        let seeds: [&[u8]; 3] = [b"desk", ctx.accounts.desk.owner.as_ref(), &bump_bytes];
        let signer_seeds: &[&[&[u8]]] = &[&seeds];
        let cpi_accounts = SplTransfer { from: ctx.accounts.desk_usdc_treasury.to_account_info(), to: ctx.accounts.to_usdc_ata.to_account_info(), authority: desk_ai };
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, lamports: u64) -> Result<()> {
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        let (expected, bump) = Pubkey::find_program_address(&[b"desk", ctx.accounts.desk.owner.as_ref()], &crate::ID);
        require!(expected == ctx.accounts.desk.key(), OtcError::NotOwner);
        let bump_bytes = [bump];
        let seeds: [&[u8]; 3] = [b"desk", ctx.accounts.desk.owner.as_ref(), &bump_bytes];
        let signer_seeds: &[&[&[u8]]] = &[&seeds];
        let ix = anchor_lang::solana_program::system_instruction::transfer(&ctx.accounts.desk.key(), &ctx.accounts.to.key(), lamports);
        anchor_lang::solana_program::program::invoke_signed(&ix, &[
            ctx.accounts.desk.to_account_info(),
            ctx.accounts.to.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ], signer_seeds)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitDesk<'info> {
    /// CHECK:
    pub owner: Signer<'info>,
    /// CHECK:
    pub agent: UncheckedAccount<'info>,
    pub token_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    #[account(init, payer = payer, space = 8 + Desk::SIZE, seeds = [b"desk", owner.key().as_ref()], bump)]
    pub desk: Account<'info, Desk>,
    #[account(mut, constraint = desk_token_treasury.mint == token_mint.key(), constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = desk_usdc_treasury.mint == usdc_mint.key(), constraint = desk_usdc_treasury.owner == desk.key())]
    pub desk_usdc_treasury: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct OnlyOwnerDesk<'info> {
    #[account(mut, has_one = owner)]
    pub desk: Account<'info, Desk>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, constraint = owner_token_ata.mint == desk.token_mint, constraint = owner_token_ata.owner == owner.key())]
    pub owner_token_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(init, payer = beneficiary, space = 8 + Offer::SIZE, seeds = [b"offer", desk.key().as_ref(), &offer_id.to_le_bytes()], bump)]
    pub offer: Account<'info, Offer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveOffer<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    pub approver: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct FulfillOfferUsdc<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = desk_usdc_treasury.mint == desk.usdc_mint, constraint = desk_usdc_treasury.owner == desk.key())]
    pub desk_usdc_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = payer_usdc_ata.mint == desk.usdc_mint, constraint = payer_usdc_ata.owner == payer.key())]
    pub payer_usdc_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillOfferSol<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = beneficiary_token_ata.mint == desk.token_mint, constraint = beneficiary_token_ata.owner == beneficiary.key())]
    pub beneficiary_token_ata: Account<'info, TokenAccount>,
    pub beneficiary: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawTokens<'info> {
    pub desk: Account<'info, Desk>,
    pub owner: Signer<'info>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = owner_token_ata.mint == desk.token_mint, constraint = owner_token_ata.owner == owner.key())]
    pub owner_token_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawUsdc<'info> {
    pub desk: Account<'info, Desk>,
    pub owner: Signer<'info>,
    #[account(mut, constraint = desk_usdc_treasury.mint == desk.usdc_mint, constraint = desk_usdc_treasury.owner == desk.key())]
    pub desk_usdc_treasury: Account<'info, TokenAccount>,
    #[account(mut, constraint = to_usdc_ata.mint == desk.usdc_mint, constraint = to_usdc_ata.owner == owner.key())]
    pub to_usdc_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    pub desk: Account<'info, Desk>,
    pub owner: Signer<'info>,
    /// CHECK: system account
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Desk {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub token_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub token_decimals: u8,
    pub usdc_decimals: u8,
    pub min_usd_amount_8d: u64,
    pub max_token_per_order: u64,
    pub quote_expiry_secs: i64,
    pub default_unlock_delay_secs: i64,
    pub max_lockup_secs: i64,
    pub max_price_age_secs: i64,
    pub token_deposited: u64,
    pub token_reserved: u64,
    pub token_usd_price_8d: u64,
    pub sol_usd_price_8d: u64,
    pub prices_updated_at: i64,
    pub restrict_fulfill: bool,
    pub approvers: Vec<Pubkey>,
    pub next_offer_id: u64,
    pub paused: bool,
}

impl Desk { pub const SIZE: usize = 32+32+32+32+1+1+8+8+8+8+8+8+8+8+8+1+4+(32*32)+8+1; }

#[account]
pub struct Offer {
    pub desk: Pubkey,
    pub id: u64,
    pub beneficiary: Pubkey,
    pub token_amount: u64,
    pub discount_bps: u16,
    pub created_at: i64,
    pub unlock_time: i64,
    pub price_usd_per_token_8d: u64,
    pub sol_usd_price_8d: u64,
    pub currency: u8,
    pub approved: bool,
    pub paid: bool,
    pub fulfilled: bool,
    pub cancelled: bool,
    pub payer: Pubkey,
    pub amount_paid: u64,
}

impl Offer { pub const SIZE: usize = 32+8+32+8+2+8+8+8+8+1+1+1+1+32+8; }

fn available_inventory(desk: &Desk, treasury_amount: u64) -> u64 { if treasury_amount < desk.token_reserved { 0 } else { treasury_amount - desk.token_reserved } }
fn only_owner(desk: &Desk, who: &Pubkey) -> Result<()> { require!(*who == desk.owner, OtcError::NotOwner); Ok(()) }
fn must_be_approver(desk: &Desk, who: &Pubkey) -> Result<()> { require!((*who == desk.agent) || desk.approvers.contains(who), OtcError::NotApprover); Ok(()) }
fn validate_offer_pda(desk_key: &Pubkey, offer_key: &Pubkey, offer_id: u64) -> Result<()> {
    let (expected, _) = Pubkey::find_program_address(&[b"offer", desk_key.as_ref(), &offer_id.to_le_bytes()], &crate::ID);
    require!(expected == *offer_key, OtcError::BadState);
    Ok(())
}
fn pow10(exp: u32) -> u128 { 10u128.pow(exp) }
fn mul_div_u128(a: u128, b: u128, d: u128) -> Result<u128> { a.checked_mul(b).and_then(|x| x.checked_div(d)).ok_or(OtcError::Overflow.into()) }
fn mul_div_ceil_u128(a: u128, b: u128, d: u128) -> Result<u128> { let prod = a.checked_mul(b).ok_or(OtcError::Overflow)?; let q = prod / d; let r = prod % d; Ok(if r == 0 { q } else { q + 1 }) }

#[error_code]
pub enum OtcError {
    #[msg("USDC must have 6 decimals")] UsdcDecimals,
    #[msg("Amount out of range")] AmountRange,
    #[msg("Discount too high")] Discount,
    #[msg("Price data is stale")] StalePrice,
    #[msg("No price set")] NoPrice,
    #[msg("Minimum USD not met")] MinUsd,
    #[msg("Insufficient token inventory")] InsuffInv,
    #[msg("Overflow")] Overflow,
    #[msg("Lockup too long")] LockupTooLong,
    #[msg("Bad state")] BadState,
    #[msg("Already approved")] AlreadyApproved,
    #[msg("Not approved")] NotApproved,
    #[msg("Quote expired")] Expired,
    #[msg("Fulfill restricted")] FulfillRestricted,
    #[msg("Locked")] Locked,
    #[msg("Not owner")] NotOwner,
    #[msg("Not approver")] NotApprover,
    #[msg("Too many approvers")] TooManyApprovers,
    #[msg("Unsupported currency")] UnsupportedCurrency,
    #[msg("Paused")] Paused,
    #[msg("Not expired")] NotExpired,
}


