#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("8X2wDShtcJ5mFrcsJPjK8tQCD16zBqzsUGwhSCM4ggko");

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
        quote_expiry_secs: i64,
    ) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        desk.owner = ctx.accounts.owner.key();
        desk.agent = ctx.accounts.agent.key();
        desk.usdc_mint = ctx.accounts.usdc_mint.key();
        desk.usdc_decimals = ctx.accounts.usdc_mint.decimals;
        require!(desk.usdc_decimals == 6, OtcError::UsdcDecimals);
        desk.min_usd_amount_8d = min_usd_amount_8d;
        desk.quote_expiry_secs = quote_expiry_secs;
        desk.max_price_age_secs = 3600;
        desk.restrict_fulfill = false;
        desk.next_consignment_id = 1;
        desk.next_offer_id = 1;
        desk.paused = false;
        desk.sol_price_feed_id = [0u8; 32];
        desk.sol_usd_price_8d = 0;
        desk.prices_updated_at = 0;
        // Initialize new fields
        desk.token_mint = ctx.accounts.token_mint.key();
        desk.token_decimals = ctx.accounts.token_mint.decimals;
        desk.token_deposited = 0;
        desk.token_reserved = 0;
        desk.token_price_feed_id = [0u8; 32];
        desk.token_usd_price_8d = 0;
        desk.default_unlock_delay_secs = 0;
        desk.max_lockup_secs = 365 * 86400; // 1 year default
        desk.max_token_per_order = 10_000 * 10u64.pow(desk.token_decimals as u32);
        desk.emergency_refund_enabled = false;
        desk.emergency_refund_deadline_secs = 30 * 86400; // 30 days default
        desk.approvers = Vec::new();
        Ok(())
    }

    pub fn register_token(
        ctx: Context<RegisterToken>,
        price_feed_id: [u8; 32],
    ) -> Result<()> {
        let desk = &ctx.accounts.desk;
        only_owner(desk, &ctx.accounts.owner.key())?;
        
        let registry = &mut ctx.accounts.token_registry;
        registry.desk = desk.key();
        registry.token_mint = ctx.accounts.token_mint.key();
        registry.decimals = ctx.accounts.token_mint.decimals;
        registry.price_feed_id = price_feed_id;
        registry.is_active = true;
        registry.token_usd_price_8d = 0;
        registry.prices_updated_at = 0;
        Ok(())
    }

    pub fn create_consignment(
        ctx: Context<CreateConsignment>,
        amount: u64,
        is_negotiable: bool,
        fixed_discount_bps: u16,
        fixed_lockup_days: u32,
        min_discount_bps: u16,
        max_discount_bps: u16,
        min_lockup_days: u32,
        max_lockup_days: u32,
        min_deal_amount: u64,
        max_deal_amount: u64,
        is_fractionalized: bool,
        is_private: bool,
        max_price_volatility_bps: u16,
        max_time_to_execute_secs: i64,
    ) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        require!(amount > 0, OtcError::AmountRange);
        require!(min_deal_amount <= max_deal_amount, OtcError::AmountRange);
        require!(min_discount_bps <= max_discount_bps, OtcError::Discount);
        require!(min_lockup_days <= max_lockup_days, OtcError::LockupTooLong);

        let cpi_accounts = SplTransfer {
            from: ctx.accounts.consigner_token_ata.to_account_info(),
            to: ctx.accounts.desk_token_treasury.to_account_info(),
            authority: ctx.accounts.consigner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let consignment_id = desk.next_consignment_id;
        desk.next_consignment_id = consignment_id.checked_add(1).ok_or(OtcError::Overflow)?;

        let consignment = &mut ctx.accounts.consignment;
        consignment.desk = desk.key();
        consignment.id = consignment_id;
        consignment.token_mint = ctx.accounts.token_mint.key();
        consignment.consigner = ctx.accounts.consigner.key();
        consignment.total_amount = amount;
        consignment.remaining_amount = amount;
        consignment.is_negotiable = is_negotiable;
        consignment.fixed_discount_bps = fixed_discount_bps;
        consignment.fixed_lockup_days = fixed_lockup_days;
        consignment.min_discount_bps = min_discount_bps;
        consignment.max_discount_bps = max_discount_bps;
        consignment.min_lockup_days = min_lockup_days;
        consignment.max_lockup_days = max_lockup_days;
        consignment.min_deal_amount = min_deal_amount;
        consignment.max_deal_amount = max_deal_amount;
        consignment.is_fractionalized = is_fractionalized;
        consignment.is_private = is_private;
        consignment.max_price_volatility_bps = max_price_volatility_bps;
        consignment.max_time_to_execute_secs = max_time_to_execute_secs;
        consignment.is_active = true;
        consignment.created_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn set_prices(ctx: Context<OnlyOwnerDesk>, token_usd_8d: u64, sol_usd_8d: u64, _updated_at: i64, max_age: i64) -> Result<()> {
        require!(max_age >= 0, OtcError::AmountRange);
        // Add price bounds checking like EVM version
        require!(token_usd_8d > 0 && token_usd_8d <= 1_000_000_000_000, OtcError::BadPrice); // Max $10,000 per token (8 decimals)
        require!(sol_usd_8d >= 1_000_000 && sol_usd_8d <= 10_000_000_000_000, OtcError::BadPrice); // $0.01 - $100,000
        
        let now = Clock::get()?.unix_timestamp;
        let desk = &mut ctx.accounts.desk;
        desk.token_usd_price_8d = token_usd_8d;
        desk.sol_usd_price_8d = sol_usd_8d;
        desk.prices_updated_at = now;
        desk.max_price_age_secs = max_age;
        emit!(PricesUpdated { token_usd_8d, sol_usd_8d, updated_at: now, max_age });
        Ok(())
    }

    pub fn set_pyth_feeds(ctx: Context<OnlyOwnerDesk>, token_feed_id: [u8; 32], sol_feed_id: [u8; 32]) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        desk.token_price_feed_id = token_feed_id;
        desk.sol_price_feed_id = sol_feed_id;
        Ok(())
    }

    pub fn update_prices_from_pyth(
        ctx: Context<UpdatePricesFromPyth>,
        token_feed_id: [u8; 32],
        sol_feed_id: [u8; 32],
        max_price_deviation_bps: u16,
    ) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        // Enforce configured feed IDs and ignore arbitrary input
        require!(desk.token_price_feed_id != [0u8; 32] && desk.sol_price_feed_id != [0u8; 32], OtcError::FeedNotConfigured);
        require!(desk.token_price_feed_id == token_feed_id && desk.sol_price_feed_id == sol_feed_id, OtcError::BadState);
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let max_age = desk.max_price_age_secs as u64;

        // Get prices from Pyth with feed ID validation
        let token_price = ctx.accounts.token_price_feed
            .get_price_no_older_than(&clock, max_age, &desk.token_price_feed_id)
            .map_err(|_| OtcError::StalePrice)?;
        
        let sol_price = ctx.accounts.sol_price_feed
            .get_price_no_older_than(&clock, max_age, &desk.sol_price_feed_id)
            .map_err(|_| OtcError::StalePrice)?;

        // Convert Pyth prices to our 8-decimal format
        let token_usd_8d = convert_pyth_price(token_price.price, token_price.exponent)?;
        let sol_usd_8d = convert_pyth_price(sol_price.price, sol_price.exponent)?;

        // Price deviation check (prevent manipulation/oracle attacks)
        if desk.token_usd_price_8d > 0 && max_price_deviation_bps > 0 {
            let old_price = desk.token_usd_price_8d;
            let price_diff = if token_usd_8d > old_price {
                token_usd_8d - old_price
            } else {
                old_price - token_usd_8d
            };
            let max_deviation = (old_price as u128 * max_price_deviation_bps as u128) / 10000u128;
            require!(price_diff as u128 <= max_deviation, OtcError::PriceDeviationTooLarge);
        }

        // Also enforce deviation bound for SOL price if previously set
        if desk.sol_usd_price_8d > 0 && max_price_deviation_bps > 0 {
            let old_price = desk.sol_usd_price_8d;
            let price_diff = if sol_usd_8d > old_price { sol_usd_8d - old_price } else { old_price - sol_usd_8d };
            let max_deviation = (old_price as u128 * max_price_deviation_bps as u128) / 10000u128;
            require!(price_diff as u128 <= max_deviation, OtcError::PriceDeviationTooLarge);
        }

        desk.token_usd_price_8d = token_usd_8d;
        desk.sol_usd_price_8d = sol_usd_8d;
        desk.prices_updated_at = current_time;

        emit!(PricesUpdated {
            token_usd_8d,
            sol_usd_8d,
            updated_at: current_time,
            max_age: desk.max_price_age_secs
        });

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

    pub fn create_offer_from_consignment(
        ctx: Context<CreateOfferFromConsignment>,
        consignment_id: u64,
        token_amount: u64,
        discount_bps: u16,
        currency: u8,
        lockup_secs: i64,
    ) -> Result<()> {
        let desk_key = ctx.accounts.desk.key();
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        require!(currency == 0 || currency == 1, OtcError::UnsupportedCurrency);

        let consignment = &mut ctx.accounts.consignment;
        require!(consignment.is_active, OtcError::BadState);
        require!(token_amount >= consignment.min_deal_amount && token_amount <= consignment.max_deal_amount, OtcError::AmountRange);
        require!(token_amount <= consignment.remaining_amount, OtcError::InsuffInv);

        if consignment.is_negotiable {
            require!(discount_bps >= consignment.min_discount_bps && discount_bps <= consignment.max_discount_bps, OtcError::Discount);
            let lockup_days = lockup_secs / 86400;
            require!(lockup_days >= consignment.min_lockup_days as i64 && lockup_days <= consignment.max_lockup_days as i64, OtcError::LockupTooLong);
        } else {
            require!(discount_bps == consignment.fixed_discount_bps, OtcError::Discount);
            let lockup_days = lockup_secs / 86400;
            require!(lockup_days == consignment.fixed_lockup_days as i64, OtcError::LockupTooLong);
        }

        let registry = &ctx.accounts.token_registry;
        let price_8d = registry.token_usd_price_8d;
        require!(price_8d > 0, OtcError::NoPrice);
        
        let now = Clock::get()?.unix_timestamp;
        if registry.prices_updated_at > 0 {
            require!(now - registry.prices_updated_at <= desk.max_price_age_secs, OtcError::StalePrice);
        }

        let total_usd_8d = mul_div_u128(token_amount as u128, price_8d as u128, pow10(registry.decimals as u32) as u128)? as u64;
        let total_usd_disc = total_usd_8d.checked_mul((10_000 - discount_bps as u64) as u64).ok_or(OtcError::Overflow)?.checked_div(10_000).ok_or(OtcError::Overflow)?;
        require!(total_usd_disc >= desk.min_usd_amount_8d, OtcError::MinUsd);

        consignment.remaining_amount = consignment.remaining_amount.checked_sub(token_amount).ok_or(OtcError::Overflow)?;
        if consignment.remaining_amount == 0 {
            consignment.is_active = false;
        }

        let offer_id = desk.next_offer_id;
        desk.next_offer_id = offer_id.checked_add(1).ok_or(OtcError::Overflow)?;

        let offer_key = ctx.accounts.offer.key();
        let beneficiary_key = ctx.accounts.beneficiary.key();
        let offer = &mut ctx.accounts.offer;
        
        offer.desk = desk_key;
        offer.consignment_id = consignment_id;
        offer.token_mint = consignment.token_mint;
        offer.id = offer_id;
        offer.beneficiary = beneficiary_key;
        offer.token_amount = token_amount;
        offer.discount_bps = discount_bps;
        offer.created_at = now;
        offer.unlock_time = now.checked_add(lockup_secs).ok_or(OtcError::Overflow)?;
        offer.price_usd_per_token_8d = price_8d;
        offer.max_price_deviation_bps = consignment.max_price_volatility_bps;
        offer.sol_usd_price_8d = if currency == 0 { desk.sol_usd_price_8d } else { 0 };
        offer.currency = currency;
        offer.approved = false;
        offer.paid = false;
        offer.fulfilled = false;
        offer.cancelled = false;
        offer.payer = Pubkey::default();
        offer.amount_paid = 0;

        emit!(OfferCreated {
            desk: offer.desk,
            offer: offer_key,
            beneficiary: beneficiary_key,
            token_amount,
            discount_bps,
            currency
        });
        Ok(())
    }

    pub fn withdraw_consignment(ctx: Context<WithdrawConsignment>, _consignment_id: u64) -> Result<()> {
        let consignment = &mut ctx.accounts.consignment;
        require!(consignment.consigner == ctx.accounts.consigner.key(), OtcError::NotOwner);
        require!(consignment.is_active, OtcError::BadState);
        let withdraw_amount = consignment.remaining_amount;
        require!(withdraw_amount > 0, OtcError::AmountRange);

        consignment.is_active = false;
        consignment.remaining_amount = 0;

        let cpi_accounts = SplTransfer {
            from: ctx.accounts.desk_token_treasury.to_account_info(),
            to: ctx.accounts.consigner_token_ata.to_account_info(),
            authority: ctx.accounts.desk_signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, withdraw_amount)?;
        Ok(())
    }

    pub fn approve_offer(ctx: Context<ApproveOffer>, _offer_id: u64) -> Result<()> {
        let desk = &ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        must_be_approver(desk, &ctx.accounts.approver.key())?;
        
        let offer_key = ctx.accounts.offer.key();
        let approver_key = ctx.accounts.approver.key();
        
        let offer = &mut ctx.accounts.offer;
        require!(!offer.cancelled && !offer.paid, OtcError::BadState);
        require!(!offer.approved, OtcError::AlreadyApproved);
        
        offer.approved = true;
        emit!(OfferApproved { offer: offer_key, approver: approver_key });
        Ok(())
    }

    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let desk = &ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        
        let caller = ctx.accounts.caller.key();
        let offer_key = ctx.accounts.offer.key();
        let now = Clock::get()?.unix_timestamp;
        
        let offer = &mut ctx.accounts.offer;
        require!(!offer.paid && !offer.fulfilled, OtcError::BadState);
        
        if caller == offer.beneficiary {
            let expiry = offer.created_at.checked_add(desk.quote_expiry_secs).ok_or(OtcError::Overflow)?;
            require!(now >= expiry, OtcError::NotExpired);
        } else if caller == desk.owner || caller == desk.agent || desk.approvers.contains(&caller) {
        } else {
            return err!(OtcError::NotApprover);
        }
        
        offer.cancelled = true;
        emit!(OfferCancelled { offer: offer_key, by: caller });
        Ok(())
    }

    pub fn fulfill_offer_usdc(ctx: Context<FulfillOfferUsdc>, _offer_id: u64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        // Removed PDA validation - now using keypairs for offers
        let offer = &mut ctx.accounts.offer;
        require!(offer.currency == 1, OtcError::BadState);
        require!(offer.approved, OtcError::NotApproved);
        require!(!offer.cancelled && !offer.paid && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp;
        let expiry = offer.created_at.checked_add(desk.quote_expiry_secs).ok_or(OtcError::Overflow)?;
        require!(now <= expiry, OtcError::Expired);
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
        // Removed PDA validation - now using keypairs for offers
        let offer = &mut ctx.accounts.offer;
        require!(offer.currency == 0, OtcError::BadState);
        require!(offer.approved, OtcError::NotApproved);
        require!(!offer.cancelled && !offer.paid && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp;
        let expiry = offer.created_at.checked_add(desk.quote_expiry_secs).ok_or(OtcError::Overflow)?;
        require!(now <= expiry, OtcError::Expired);
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
        // Desk keypair signs to authorize token transfer
        let desk = &ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        require!(ctx.accounts.desk_signer.key() == desk.key(), OtcError::NotOwner);
        
        let offer_key = ctx.accounts.offer.key();
        let offer = &mut ctx.accounts.offer;
        require!(ctx.accounts.beneficiary.key() == offer.beneficiary, OtcError::NotOwner);
        require!(offer.paid && !offer.cancelled && !offer.fulfilled, OtcError::BadState);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= offer.unlock_time, OtcError::Locked);
        
        // Transfer tokens from desk treasury to beneficiary (desk_signer authorizes)
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.desk_token_treasury.to_account_info(),
            to: ctx.accounts.beneficiary_token_ata.to_account_info(),
            authority: ctx.accounts.desk_signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, offer.token_amount)?;
        
        let desk_mut = &mut ctx.accounts.desk;
        desk_mut.token_reserved = desk_mut.token_reserved.checked_sub(offer.token_amount).ok_or(OtcError::Overflow)?;
        offer.fulfilled = true;
        emit!(TokensClaimed { offer: offer_key, beneficiary: offer.beneficiary, amount: offer.token_amount });
        Ok(())
    }

    pub fn withdraw_tokens(ctx: Context<WithdrawTokens>, amount: u64) -> Result<()> {
        // Desk keypair signs to authorize withdrawal
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        require!(ctx.accounts.desk_signer.key() == ctx.accounts.desk.key(), OtcError::NotOwner);
        // Prevent withdrawing below reserved
        let after_amount = ctx.accounts.desk_token_treasury.amount.checked_sub(amount).ok_or(OtcError::Overflow)?;
        require!(after_amount >= ctx.accounts.desk.token_reserved, OtcError::InsuffInv);
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.desk_token_treasury.to_account_info(),
            to: ctx.accounts.owner_token_ata.to_account_info(),
            authority: ctx.accounts.desk_signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn withdraw_usdc(ctx: Context<WithdrawUsdc>, amount: u64) -> Result<()> {
        // Desk keypair signs to authorize withdrawal
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        require!(ctx.accounts.desk_signer.key() == ctx.accounts.desk.key(), OtcError::NotOwner);
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.desk_usdc_treasury.to_account_info(),
            to: ctx.accounts.to_usdc_ata.to_account_info(),
            authority: ctx.accounts.desk_signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, lamports: u64) -> Result<()> {
        // Desk keypair signs to authorize withdrawal
        only_owner(&ctx.accounts.desk, &ctx.accounts.owner.key())?;
        require!(ctx.accounts.desk_signer.key() == ctx.accounts.desk.key(), OtcError::NotOwner);
        // keep rent-exempt minimum
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(8 + Desk::SIZE);
        let current = ctx.accounts.desk.to_account_info().lamports();
        let after = current.checked_sub(lamports).ok_or(OtcError::Overflow)?;
        require!(after >= min_rent, OtcError::BadState);
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.desk_signer.key(),
            &ctx.accounts.to.key(),
            lamports
        );
        anchor_lang::solana_program::program::invoke(&ix, &[
            ctx.accounts.desk_signer.to_account_info(),
            ctx.accounts.to.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ])?;
        Ok(())
    }

    pub fn set_emergency_refund(ctx: Context<OnlyOwnerDesk>, enabled: bool, deadline_secs: i64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        desk.emergency_refund_enabled = enabled;
        desk.emergency_refund_deadline_secs = deadline_secs;
        Ok(())
    }

    pub fn emergency_refund_sol(ctx: Context<EmergencyRefundSol>, _offer_id: u64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(desk.emergency_refund_enabled, OtcError::BadState);
        
        let offer = &mut ctx.accounts.offer;
        require!(offer.paid && !offer.fulfilled && !offer.cancelled, OtcError::BadState);
        require!(offer.currency == 0, OtcError::BadState); // SOL payment
        
        let now = Clock::get()?.unix_timestamp;
        let deadline = offer.created_at.checked_add(desk.emergency_refund_deadline_secs).ok_or(OtcError::Overflow)?;
        let unlock_deadline = offer.unlock_time.checked_add(30 * 86400).ok_or(OtcError::Overflow)?; // 30 days after unlock
        
        require!(now >= deadline || now >= unlock_deadline, OtcError::TooEarlyForRefund);
        
        let caller = ctx.accounts.caller.key();
        require!(
            caller == offer.payer || 
            caller == offer.beneficiary || 
            caller == desk.owner || 
            caller == desk.agent || 
            desk.approvers.contains(&caller),
            OtcError::NotOwner
        );
        
        // Mark as cancelled to prevent double refund
        offer.cancelled = true;
        
        // Release reserved tokens
        desk.token_reserved = desk.token_reserved.checked_sub(offer.token_amount).ok_or(OtcError::Overflow)?;
        
        // Refund SOL to payer
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.desk_signer.key(),
            &offer.payer,
            offer.amount_paid
        );
        anchor_lang::solana_program::program::invoke(&ix, &[
            ctx.accounts.desk_signer.to_account_info(),
            ctx.accounts.payer_refund.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ])?;
        
        Ok(())
    }

    pub fn emergency_refund_usdc(ctx: Context<EmergencyRefundUsdc>, _offer_id: u64) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(desk.emergency_refund_enabled, OtcError::BadState);
        
        let offer = &mut ctx.accounts.offer;
        require!(offer.paid && !offer.fulfilled && !offer.cancelled, OtcError::BadState);
        require!(offer.currency == 1, OtcError::BadState); // USDC payment
        
        let now = Clock::get()?.unix_timestamp;
        let deadline = offer.created_at.checked_add(desk.emergency_refund_deadline_secs).ok_or(OtcError::Overflow)?;
        let unlock_deadline = offer.unlock_time.checked_add(30 * 86400).ok_or(OtcError::Overflow)?;
        
        require!(now >= deadline || now >= unlock_deadline, OtcError::TooEarlyForRefund);
        
        let caller = ctx.accounts.caller.key();
        require!(
            caller == offer.payer || 
            caller == offer.beneficiary || 
            caller == desk.owner || 
            caller == desk.agent || 
            desk.approvers.contains(&caller),
            OtcError::NotOwner
        );
        
        // Mark as cancelled
        offer.cancelled = true;
        
        // Release reserved tokens
        desk.token_reserved = desk.token_reserved.checked_sub(offer.token_amount).ok_or(OtcError::Overflow)?;
        
        // Refund USDC to payer
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.desk_usdc_treasury.to_account_info(),
            to: ctx.accounts.payer_usdc_refund.to_account_info(),
            authority: ctx.accounts.desk_signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, offer.amount_paid)?;
        
        Ok(())
    }

    pub fn auto_claim(ctx: Context<AutoClaim>, offer_ids: Vec<u64>) -> Result<()> {
        let desk = &mut ctx.accounts.desk;
        require!(!desk.paused, OtcError::Paused);
        must_be_approver(desk, &ctx.accounts.approver.key())?;
        require!(offer_ids.len() <= 10, OtcError::TooManyOffers); // Limit batch size for compute units
        
        let _now = Clock::get()?.unix_timestamp;
        
        // Process each offer
        for _offer_id in offer_ids {
            // Would need to load each offer account dynamically
            // This is simplified - in practice would need remaining accounts
            // Skip for now as it requires dynamic account loading
        }
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitDesk<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,
    pub agent: UncheckedAccount<'info>,
    pub token_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    #[account(init, payer = payer, space = 8 + Desk::SIZE)]
    pub desk: Account<'info, Desk>,
}

#[derive(Accounts)]
pub struct RegisterToken<'info> {
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    #[account(init, payer = owner, space = 8 + TokenRegistry::SIZE)]
    pub token_registry: Account<'info, TokenRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateConsignment<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub consigner: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub consigner_token_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(init, payer = consigner, space = 8 + Consignment::SIZE)]
    pub consignment: Account<'info, Consignment>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateOfferFromConsignment<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub consignment: Account<'info, Consignment>,
    pub token_registry: Account<'info, TokenRegistry>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(init_if_needed, payer = beneficiary, space = 8 + Offer::SIZE)]
    pub offer: Account<'info, Offer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OnlyOwnerDesk<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub desk: Account<'info, Desk>,
}

#[derive(Accounts)]
pub struct UpdatePricesFromPyth<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    /// Pyth price feed account for token/USD
    pub token_price_feed: Account<'info, PriceUpdateV2>,
    /// Pyth price feed account for SOL/USD
    pub sol_price_feed: Account<'info, PriceUpdateV2>,
    /// Anyone can update prices from oracle
    pub payer: Signer<'info>,
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
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(init_if_needed, payer = beneficiary, space = 8 + Offer::SIZE)]
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
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
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
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut, constraint = desk_token_treasury.mint == desk.token_mint, constraint = desk_token_treasury.owner == desk.key())]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub beneficiary_token_ata: Account<'info, TokenAccount>,
    pub beneficiary: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawTokens<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_token_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawUsdc<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub desk_usdc_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_usdc_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawConsignment<'info> {
    #[account(mut)]
    pub consignment: Account<'info, Consignment>,
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub consigner: Signer<'info>,
    #[account(mut)]
    pub desk_token_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub consigner_token_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    pub owner: Signer<'info>,
    /// CHECK: system account
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyRefundSol<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    pub caller: Signer<'info>,
    /// CHECK: payer to refund
    #[account(mut)]
    pub payer_refund: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyRefundUsdc<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    pub desk_signer: Signer<'info>,
    #[account(mut)]
    pub offer: Account<'info, Offer>,
    pub caller: Signer<'info>,
    #[account(mut)]
    pub desk_usdc_treasury: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer_usdc_refund: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AutoClaim<'info> {
    #[account(mut)]
    pub desk: Account<'info, Desk>,
    pub approver: Signer<'info>,
}

#[account]
pub struct Desk {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub usdc_mint: Pubkey,
    pub usdc_decimals: u8,
    pub min_usd_amount_8d: u64,
    pub quote_expiry_secs: i64,
    pub max_price_age_secs: i64,
    pub restrict_fulfill: bool,
    pub approvers: Vec<Pubkey>,
    pub next_consignment_id: u64,
    pub next_offer_id: u64,
    pub paused: bool,
    pub sol_price_feed_id: [u8; 32],
    pub sol_usd_price_8d: u64,
    pub prices_updated_at: i64,
    // Missing fields from EVM version
    pub token_mint: Pubkey,
    pub token_decimals: u8,
    pub token_deposited: u64,
    pub token_reserved: u64,
    pub token_price_feed_id: [u8; 32],
    pub token_usd_price_8d: u64,
    pub default_unlock_delay_secs: i64,
    pub max_lockup_secs: i64,
    pub max_token_per_order: u64,
    pub emergency_refund_enabled: bool,
    pub emergency_refund_deadline_secs: i64,
}

impl Desk { pub const SIZE: usize = 32+32+32+1+8+8+8+1+4+(32*32)+8+8+1+32+8+8+32+1+8+8+32+8+8+8+8+1+8; }

#[account]
pub struct TokenRegistry {
    pub desk: Pubkey,
    pub token_mint: Pubkey,
    pub decimals: u8,
    pub price_feed_id: [u8; 32],
    pub is_active: bool,
    pub token_usd_price_8d: u64,
    pub prices_updated_at: i64,
}

impl TokenRegistry { pub const SIZE: usize = 32+32+1+32+1+8+8; }

#[account]
pub struct Consignment {
    pub desk: Pubkey,
    pub id: u64,
    pub token_mint: Pubkey,
    pub consigner: Pubkey,
    pub total_amount: u64,
    pub remaining_amount: u64,
    pub is_negotiable: bool,
    pub fixed_discount_bps: u16,
    pub fixed_lockup_days: u32,
    pub min_discount_bps: u16,
    pub max_discount_bps: u16,
    pub min_lockup_days: u32,
    pub max_lockup_days: u32,
    pub min_deal_amount: u64,
    pub max_deal_amount: u64,
    pub is_fractionalized: bool,
    pub is_private: bool,
    pub max_price_volatility_bps: u16,
    pub max_time_to_execute_secs: i64,
    pub is_active: bool,
    pub created_at: i64,
}

impl Consignment { pub const SIZE: usize = 32+8+32+32+8+8+1+2+4+2+2+4+4+8+8+1+1+2+8+1+8; }

#[account]
pub struct Offer {
    pub desk: Pubkey,
    pub consignment_id: u64,
    pub token_mint: Pubkey,
    pub id: u64,
    pub beneficiary: Pubkey,
    pub token_amount: u64,
    pub discount_bps: u16,
    pub created_at: i64,
    pub unlock_time: i64,
    pub price_usd_per_token_8d: u64,
    pub max_price_deviation_bps: u16,
    pub sol_usd_price_8d: u64,
    pub currency: u8,
    pub approved: bool,
    pub paid: bool,
    pub fulfilled: bool,
    pub cancelled: bool,
    pub payer: Pubkey,
    pub amount_paid: u64,
}

impl Offer { pub const SIZE: usize = 32+8+32+8+32+8+2+8+8+8+2+8+1+1+1+1+1+32+8; }

fn available_inventory(desk: &Desk, treasury_balance: u64) -> u64 {
    if treasury_balance < desk.token_reserved {
        return 0;
    }
    treasury_balance - desk.token_reserved
}
fn only_owner(desk: &Desk, who: &Pubkey) -> Result<()> { require!(*who == desk.owner, OtcError::NotOwner); Ok(()) }
fn must_be_approver(desk: &Desk, who: &Pubkey) -> Result<()> { require!((*who == desk.agent) || desk.approvers.contains(who), OtcError::NotApprover); Ok(()) }
fn pow10(exp: u32) -> u128 { 10u128.pow(exp) }
fn mul_div_u128(a: u128, b: u128, d: u128) -> Result<u128> { a.checked_mul(b).and_then(|x| x.checked_div(d)).ok_or(OtcError::Overflow.into()) }
fn mul_div_ceil_u128(a: u128, b: u128, d: u128) -> Result<u128> { let prod = a.checked_mul(b).ok_or(OtcError::Overflow)?; let q = prod / d; let r = prod % d; Ok(if r == 0 { q } else { q + 1 }) }

/// Convert Pyth price to our 8-decimal USD format
/// Pyth prices are i64 with exponent (e.g., price=50000000, expo=-8 means $0.50)
fn convert_pyth_price(price: i64, exponent: i32) -> Result<u64> {
    require!(price > 0, OtcError::BadPrice);
    
    // Target: 8 decimals (1e8 = $1)
    let target_exp = 8i32;
    let exp_diff = target_exp - exponent;
    // Prevent overflow in pow for extreme exponents
    require!(exp_diff <= 38 && exp_diff >= -38, OtcError::BadPrice);
    
    let price_u128 = price as u128;
    let result = if exp_diff >= 0 {
        // Scale up
        price_u128.checked_mul(10u128.pow(exp_diff as u32)).ok_or(OtcError::Overflow)?
    } else {
        // Scale down
        price_u128.checked_div(10u128.pow((-exp_diff) as u32)).ok_or(OtcError::Overflow)?
    };
    
    u64::try_from(result).map_err(|_| OtcError::Overflow.into())
}

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
    #[msg("Bad price from oracle")] BadPrice,
    #[msg("Price deviation too large")] PriceDeviationTooLarge,
    #[msg("Oracle feed IDs not configured")] FeedNotConfigured,
    #[msg("Too early for emergency refund")] TooEarlyForRefund,
    #[msg("Too many offers for batch")] TooManyOffers,
}


