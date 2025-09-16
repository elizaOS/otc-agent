// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface AggregatorV3Interface {
  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
  function decimals() external view returns (uint8);
}

/// @title OTC-like Token Sale Desk
/// @notice Permissionless offer creation, approver-gated approvals, price snapshot on creation using Chainlink.
///         No vesting; single unlock time per deal. Supports ETH or USDC payments. Tracks token and stable treasuries.
contract OTC is Ownable, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Math for uint256;
  enum PaymentCurrency { ETH, USDC }

  struct Offer {
    address beneficiary; // who receives tokens at unlock
    uint256 tokenAmount; // 18 decimals
    uint256 discountBps; // 0..2500
    uint256 createdAt;   // timestamp
    uint256 unlockTime;  // timestamp
    uint256 priceUsdPerToken; // 8-decimal USD price snapshot for token
    uint256 ethUsdPrice;      // 8-decimal USD price snapshot for ETH (only if currency=ETH)
    PaymentCurrency currency;
    bool approved;
    bool paid;
    bool fulfilled;
    bool cancelled;
    address payer;
    uint256 amountPaid; // ETH in wei or USDC in 6 decimals
  }

  // tokens
  IERC20 public immutable token; // token being sold (18 decimals)
  IERC20 public immutable usdc;  // USDC stablecoin (6 decimals)

  // Chainlink price feeds
  AggregatorV3Interface public tokenUsdFeed; // token/USD (8 decimals)
  AggregatorV3Interface public ethUsdFeed;   // ETH/USD   (8 decimals)

  // Limits and controls
  uint256 public minUsdAmount = 5 * 1e8; // $5 with 8 decimals
  uint256 public maxTokenPerOrder = 10_000 * 1e18; // 10,000 tokens
  uint256 public quoteExpirySeconds = 30 minutes;
  uint256 public defaultUnlockDelaySeconds = 0; // can be set by admin
  uint256 public maxFeedAgeSeconds = 1 hours; // max allowed staleness for price feeds
  uint256 public maxLockupSeconds = 365 days; // max 1 year lockup
  uint256 public maxOpenOffersToReturn = 100; // limit for getOpenOfferIds()

  // Optional restriction: if true, only beneficiary/agent/approver may fulfill
  bool public restrictFulfillToBeneficiaryOrApprover = false;

  // Treasury tracking
  uint256 public tokenDeposited;   // total tokens ever deposited
  uint256 public tokenReserved;    // tokens reserved for paid, not-yet-claimed deals

  // Roles
  address public agent;
  mapping(address => bool) public isApprover; // distributors/approvers

  // Offers
  uint256 public nextOfferId = 1;
  mapping(uint256 => Offer) public offers; // id => Offer
  uint256[] public openOfferIds;
  mapping(address => uint256[]) private _beneficiaryOfferIds;
  
  // Emergency recovery
  bool public emergencyRefundsEnabled = false;
  uint256 public emergencyRefundDeadline = 90 days; // Time after creation when emergency refund is allowed

  // Events
  event AgentUpdated(address indexed previous, address indexed newAgent);
  event ApproverUpdated(address indexed approver, bool allowed);
  event TokenDeposited(uint256 amount);
  event TokenWithdrawn(uint256 amount);
  event StableWithdrawn(address indexed to, uint256 usdcAmount, uint256 ethAmount);
  event OfferCreated(uint256 indexed id, address indexed beneficiary, uint256 tokenAmount, uint256 discountBps, PaymentCurrency currency);
  event OfferApproved(uint256 indexed id, address indexed by);
  event OfferCancelled(uint256 indexed id, address indexed by);
  event OfferPaid(uint256 indexed id, address indexed payer, uint256 amountPaid);
  event TokensClaimed(uint256 indexed id, address indexed beneficiary, uint256 amount);
  event FeedsUpdated(address indexed tokenUsdFeed, address indexed ethUsdFeed);
  event LimitsUpdated(uint256 minUsdAmount, uint256 maxTokenPerOrder, uint256 quoteExpirySeconds, uint256 defaultUnlockDelaySeconds);
  event MaxFeedAgeUpdated(uint256 maxFeedAgeSeconds);
  event RestrictFulfillUpdated(bool enabled);
  event EmergencyRefundEnabled(bool enabled);
  event EmergencyRefund(uint256 indexed offerId, address indexed recipient, uint256 amount, PaymentCurrency currency);
  event StorageCleaned(uint256 offersRemoved);
  event RefundFailed(address indexed payer, uint256 amount);

  modifier onlyApproverRole() {
    require(msg.sender == agent || isApprover[msg.sender], "Not approver");
    _;
  }

  constructor(
    address owner_,
    IERC20 token_,
    IERC20 usdc_,
    AggregatorV3Interface tokenUsdFeed_,
    AggregatorV3Interface ethUsdFeed_,
    address agent_
  ) Ownable(owner_) {
    require(address(token_) != address(0) && address(usdc_) != address(0), "bad tokens");
    token = token_;
    usdc = usdc_;
    tokenUsdFeed = tokenUsdFeed_;
    ethUsdFeed = ethUsdFeed_;
    agent = agent_;
    // Enforce expected 8-decimal price feeds
    require(tokenUsdFeed.decimals() == 8, "token feed decimals");
    require(ethUsdFeed.decimals() == 8, "eth feed decimals");
    // Enforce token decimals assumptions
    require(IERC20Metadata(address(token_)).decimals() == 18, "token decimals");
    require(IERC20Metadata(address(usdc_)).decimals() == 6, "usdc decimals");
  }

  // Admin
  function setAgent(address newAgent) external onlyOwner { 
    require(newAgent != address(0), "zero agent");
    emit AgentUpdated(agent, newAgent); 
    agent = newAgent; 
  }
  function setApprover(address a, bool allowed) external onlyOwner { isApprover[a] = allowed; emit ApproverUpdated(a, allowed); }
  function setFeeds(AggregatorV3Interface tokenUsd, AggregatorV3Interface ethUsd) external onlyOwner {
    require(tokenUsd.decimals() == 8, "token feed decimals");
    require(ethUsd.decimals() == 8, "eth feed decimals");
    tokenUsdFeed = tokenUsd; ethUsdFeed = ethUsd;
    emit FeedsUpdated(address(tokenUsd), address(ethUsd));
  }
  function setMaxFeedAge(uint256 secs) external onlyOwner { maxFeedAgeSeconds = secs; emit MaxFeedAgeUpdated(secs); }
  function setLimits(uint256 minUsd, uint256 maxToken, uint256 expirySecs, uint256 unlockDelaySecs) external onlyOwner {
    require(unlockDelaySecs <= maxLockupSeconds, "lockup too long");
    minUsdAmount = minUsd; maxTokenPerOrder = maxToken; quoteExpirySeconds = expirySecs; defaultUnlockDelaySeconds = unlockDelaySecs;
    emit LimitsUpdated(minUsdAmount, maxTokenPerOrder, quoteExpirySeconds, defaultUnlockDelaySeconds);
  }
  function setMaxLockup(uint256 maxSecs) external onlyOwner { 
    maxLockupSeconds = maxSecs; 
  }
  function setRestrictFulfill(bool enabled) external onlyOwner { restrictFulfillToBeneficiaryOrApprover = enabled; emit RestrictFulfillUpdated(enabled); }
  function setEmergencyRefund(bool enabled) external onlyOwner { emergencyRefundsEnabled = enabled; emit EmergencyRefundEnabled(enabled); }
  function setEmergencyRefundDeadline(uint256 days_) external onlyOwner { emergencyRefundDeadline = days_ * 1 days; }
  function pause() external onlyOwner { _pause(); }
  function unpause() external onlyOwner { _unpause(); }

  // Treasury mgmt
  function depositTokens(uint256 amount) external onlyOwner {
    token.safeTransferFrom(msg.sender, address(this), amount);
    tokenDeposited += amount;
    emit TokenDeposited(amount);
  }
  function withdrawTokens(uint256 amount) external onlyOwner nonReentrant {
    require(availableTokenInventory() >= amount, "reserved");
    token.safeTransfer(owner(), amount);
    emit TokenWithdrawn(amount);
  }
  function withdrawStable(address to, uint256 usdcAmount, uint256 ethAmount) external onlyOwner nonReentrant {
    require(to != address(0), "zero addr");
    if (usdcAmount > 0) { usdc.safeTransfer(to, usdcAmount); }
    if (ethAmount > 0) { (bool ok, ) = payable(to).call{ value: ethAmount }(""); require(ok, "eth xfer"); }
    emit StableWithdrawn(to, usdcAmount, ethAmount);
  }

  function availableTokenInventory() public view returns (uint256) {
    uint256 bal = token.balanceOf(address(this));
    if (bal < tokenReserved) return 0; // should not happen
    return bal - tokenReserved;
  }

  // Offers
  function createOffer(
    uint256 tokenAmount,
    uint256 discountBps,
    PaymentCurrency currency,
    uint256 lockupSeconds
  ) external whenNotPaused returns (uint256 offerId) {
    require(tokenAmount > 0 && tokenAmount <= maxTokenPerOrder, "amount range");
    require(discountBps <= 2_500, "disc");

    uint256 priceUsdPerToken = _readTokenUsdPrice(); // 8d
    uint256 totalUsd = _mulDiv(tokenAmount, priceUsdPerToken, 1e18); // 8d
    totalUsd = (totalUsd * (10_000 - discountBps)) / 10_000; // apply discount
    require(totalUsd >= minUsdAmount, "min $5");

    require(availableTokenInventory() >= tokenAmount, "insuff token inv");

    offerId = nextOfferId++;
    Offer storage o = offers[offerId];
    o.beneficiary = msg.sender;
    o.tokenAmount = tokenAmount;
    o.discountBps = discountBps;
    o.createdAt = block.timestamp;
    uint256 lockup = lockupSeconds > 0 ? lockupSeconds : defaultUnlockDelaySeconds;
    require(lockup <= maxLockupSeconds, "lockup too long");
    o.unlockTime = block.timestamp + lockup;
    o.priceUsdPerToken = priceUsdPerToken;
    o.currency = currency;
    if (currency == PaymentCurrency.ETH) { o.ethUsdPrice = _readEthUsdPrice(); }
    _beneficiaryOfferIds[msg.sender].push(offerId);
    // Only track recent offers to prevent unbounded growth
    if (openOfferIds.length >= 1000) {
      // Remove oldest offers that are expired/completed
      _cleanupOldOffers();
    }
    openOfferIds.push(offerId);
    emit OfferCreated(offerId, o.beneficiary, tokenAmount, discountBps, currency);
  }

  function approveOffer(uint256 offerId) external onlyApproverRole whenNotPaused {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(!o.cancelled && !o.paid, "bad state");
    require(!o.approved, "already approved"); // Prevent duplicate approvals
    
    // Re-validate price hasn't moved too much (optional safety check)
    uint256 currentPrice = _readTokenUsdPrice();
    uint256 priceDiff = currentPrice > o.priceUsdPerToken ? 
      currentPrice - o.priceUsdPerToken : o.priceUsdPerToken - currentPrice;
    // Allow up to 20% price movement
    require(priceDiff <= o.priceUsdPerToken / 5, "price moved too much");
    
    o.approved = true;
    emit OfferApproved(offerId, msg.sender);
  }

  function cancelOffer(uint256 offerId) external whenNotPaused {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(!o.paid && !o.fulfilled, "already paid");
    require(msg.sender == o.beneficiary || msg.sender == owner() || msg.sender == agent || isApprover[msg.sender], "no auth");
    // Users can cancel after expiry window
    if (msg.sender == o.beneficiary) {
      require(block.timestamp >= o.createdAt + quoteExpirySeconds, "not expired");
    }
    o.cancelled = true;
    emit OfferCancelled(offerId, msg.sender);
  }

  function totalUsdForOffer(uint256 offerId) public view returns (uint256) {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    uint256 totalUsd = _mulDiv(o.tokenAmount, o.priceUsdPerToken, 1e18); // 8d
    totalUsd = (totalUsd * (10_000 - o.discountBps)) / 10_000; // 8d
    return totalUsd;
  }

  function fulfillOffer(uint256 offerId) external payable nonReentrant whenNotPaused {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.approved, "not appr");
    require(!o.cancelled && !o.paid && !o.fulfilled, "bad state");
    require(block.timestamp <= o.createdAt + quoteExpirySeconds, "expired");
    require(availableTokenInventory() >= o.tokenAmount, "insuff token inv");
    if (restrictFulfillToBeneficiaryOrApprover) {
      require(msg.sender == o.beneficiary || msg.sender == agent || isApprover[msg.sender], "fulfill restricted");
    }

    uint256 usd = totalUsdForOffer(offerId); // 8d
    if (o.currency == PaymentCurrency.ETH) {
      // Convert USD (8d) to ETH wei
      uint256 ethUsd = o.ethUsdPrice > 0 ? o.ethUsdPrice : _readEthUsdPrice(); // 8d
      uint256 weiAmount = _mulDivRoundingUp(usd, 1e18, ethUsd); // 18d, round up to avoid underpay
      require(msg.value >= weiAmount, "insufficient eth");
      // Attempt to refund excess ETH if any, but don't fail if refund fails
      // This prevents griefing attacks where a malicious contract could make fulfillOffer fail
      if (msg.value > weiAmount) {
        uint256 refundAmount = msg.value - weiAmount;
        (bool refunded, ) = payable(msg.sender).call{ value: refundAmount }("");
        if (!refunded) {
          // Log failed refund but continue - prevents griefing attack
          // The sender chose to send excess ETH and rejected the refund
          emit RefundFailed(msg.sender, refundAmount);
        }
      }
      o.amountPaid = weiAmount;
      o.payer = msg.sender;
      o.paid = true;
    } else {
      // USDC 6 decimals
      uint256 usdcAmount = _mulDivRoundingUp(usd, 1e6, 1e8);
      usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
      o.amountPaid = usdcAmount;
      o.payer = msg.sender;
      o.paid = true;
    }
    // reserve tokens for later claim
    tokenReserved += o.tokenAmount;
    emit OfferPaid(offerId, msg.sender, o.amountPaid);
  }

  function claim(uint256 offerId) external nonReentrant whenNotPaused {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.paid && !o.cancelled && !o.fulfilled, "bad state");
    require(block.timestamp >= o.unlockTime, "locked");
    o.fulfilled = true;
    tokenReserved -= o.tokenAmount;
    token.safeTransfer(o.beneficiary, o.tokenAmount);
    emit TokensClaimed(offerId, o.beneficiary, o.tokenAmount);
  }

  function autoClaim(uint256[] calldata offerIds) external onlyApproverRole nonReentrant whenNotPaused {
    require(offerIds.length <= 50, "batch too large"); // Prevent gas limit issues
    for (uint256 i = 0; i < offerIds.length; i++) {
      uint256 id = offerIds[i];
      if (id == 0 || id >= nextOfferId) continue; // Skip invalid IDs
      Offer storage o = offers[id];
      if (o.beneficiary == address(0) || !o.paid || o.cancelled || o.fulfilled) continue;
      if (block.timestamp < o.unlockTime) continue;
      o.fulfilled = true;
      tokenReserved -= o.tokenAmount;
      token.safeTransfer(o.beneficiary, o.tokenAmount);
      emit TokensClaimed(id, o.beneficiary, o.tokenAmount);
    }
  }

  function getOpenOfferIds() external view returns (uint256[] memory) {
    uint256 total = openOfferIds.length;
    // Start from the end for more recent offers
    uint256 startIdx = total > maxOpenOffersToReturn ? total - maxOpenOffersToReturn : 0;
    uint256 count = 0;
    
    // First pass: count valid offers
    for (uint256 i = startIdx; i < total && count < maxOpenOffersToReturn; i++) {
      Offer storage o = offers[openOfferIds[i]];
      if (!o.cancelled && !o.paid && block.timestamp <= o.createdAt + quoteExpirySeconds) { count++; }
    }
    
    uint256[] memory result = new uint256[](count);
    uint256 idx = 0;
    
    // Second pass: collect valid offers
    for (uint256 j = startIdx; j < total && idx < count; j++) {
      Offer storage o2 = offers[openOfferIds[j]];
      if (!o2.cancelled && !o2.paid && block.timestamp <= o2.createdAt + quoteExpirySeconds) { 
        result[idx++] = openOfferIds[j]; 
      }
    }
    return result;
  }

  function getOffersForBeneficiary(address who) external view returns (uint256[] memory) { return _beneficiaryOfferIds[who]; }

  // Pricing helpers
  function _readTokenUsdPrice() internal view returns (uint256) {
    (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = tokenUsdFeed.latestRoundData();
    require(answer > 0, "bad price");
    require(answeredInRound >= roundId, "stale round");
    require(updatedAt > 0 && block.timestamp - updatedAt <= maxFeedAgeSeconds, "stale price");
    return uint256(answer);
  }
  function _readEthUsdPrice() internal view returns (uint256) {
    (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = ethUsdFeed.latestRoundData();
    require(answer > 0, "bad price");
    require(answeredInRound >= roundId, "stale round");
    require(updatedAt > 0 && block.timestamp - updatedAt <= maxFeedAgeSeconds, "stale price");
    return uint256(answer);
  }

  function _mulDiv(uint256 a, uint256 b, uint256 d) internal pure returns (uint256) {
    return Math.mulDiv(a, b, d);
  }
  function _mulDivRoundingUp(uint256 a, uint256 b, uint256 d) internal pure returns (uint256) {
    return Math.mulDiv(a, b, d, Math.Rounding.Ceil);
  }

  // View helpers for off-chain integrations
  function requiredEthWei(uint256 offerId) external view returns (uint256) {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.currency == PaymentCurrency.ETH, "not ETH");
    uint256 usd = totalUsdForOffer(offerId);
    uint256 ethUsd = o.ethUsdPrice > 0 ? o.ethUsdPrice : _readEthUsdPrice();
    return _mulDivRoundingUp(usd, 1e18, ethUsd);
  }
  function requiredUsdcAmount(uint256 offerId) external view returns (uint256) {
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.currency == PaymentCurrency.USDC, "not USDC");
    uint256 usd = totalUsdForOffer(offerId);
    return _mulDivRoundingUp(usd, 1e6, 1e8);
  }

  // Emergency functions
  function emergencyRefund(uint256 offerId) external nonReentrant {
    require(emergencyRefundsEnabled, "emergency refunds disabled");
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.paid && !o.fulfilled && !o.cancelled, "invalid state for refund");
    require(
      msg.sender == o.payer || 
      msg.sender == o.beneficiary || 
      msg.sender == owner() || 
      msg.sender == agent || 
      isApprover[msg.sender],
      "not authorized for refund"
    );
    
    // Check if enough time has passed for emergency refund
    require(
      block.timestamp >= o.createdAt + emergencyRefundDeadline ||
      block.timestamp >= o.unlockTime + 30 days, // Or 30 days after unlock
      "too early for emergency refund"
    );
    
    // Mark as cancelled to prevent double refund
    o.cancelled = true;
    
    // Release reserved tokens
    tokenReserved -= o.tokenAmount;
    
    // Refund payment
    if (o.currency == PaymentCurrency.ETH) {
      (bool success, ) = payable(o.payer).call{value: o.amountPaid}("");
      require(success, "ETH refund failed");
    } else {
      usdc.safeTransfer(o.payer, o.amountPaid);
    }
    
    emit EmergencyRefund(offerId, o.payer, o.amountPaid, o.currency);
  }
  
  function adminEmergencyWithdraw(uint256 offerId) external onlyOwner nonReentrant {
    // Only for truly stuck funds after all parties have been given chance to claim
    Offer storage o = offers[offerId];
    require(o.beneficiary != address(0), "no offer");
    require(o.paid && !o.fulfilled && !o.cancelled, "invalid state");
    require(block.timestamp >= o.unlockTime + 180 days, "must wait 180 days after unlock");
    
    // Mark as fulfilled to prevent double withdrawal
    o.fulfilled = true;
    tokenReserved -= o.tokenAmount;
    
    // Send tokens to beneficiary (or owner if beneficiary is compromised)
    address recipient = o.beneficiary;
    if (recipient == address(0)) recipient = owner(); // Fallback to owner
    
    token.safeTransfer(recipient, o.tokenAmount);
    emit TokensClaimed(offerId, recipient, o.tokenAmount);
  }
  
  function _cleanupOldOffers() private {
    uint256 currentTime = block.timestamp;
    uint256 removed = 0;
    uint256 newLength = 0;
    
    // Create new array without old expired/completed offers
    for (uint256 i = 0; i < openOfferIds.length && removed < 100; i++) {
      uint256 id = openOfferIds[i];
      Offer storage o = offers[id];
      
      // Keep if still active and not expired
      bool shouldKeep = o.beneficiary != address(0) && 
                       !o.cancelled && 
                       !o.paid && 
                       currentTime <= o.createdAt + quoteExpirySeconds + 1 days;
      
      if (shouldKeep) {
        if (newLength != i) {
          openOfferIds[newLength] = id;
        }
        newLength++;
      } else {
        removed++;
      }
    }
    
    // Resize array
    while (openOfferIds.length > newLength) {
      openOfferIds.pop();
    }
    
    if (removed > 0) {
      emit StorageCleaned(removed);
    }
  }
  
  function cleanupExpiredOffers(uint256 maxToClean) external {
    // Public function to allow anyone to help clean storage
    require(maxToClean > 0 && maxToClean <= 100, "invalid max");
    uint256 currentTime = block.timestamp;
    uint256 cleaned = 0;
    
    for (uint256 i = 0; i < openOfferIds.length && cleaned < maxToClean; i++) {
      uint256 id = openOfferIds[i];
      Offer storage o = offers[id];
      
      if (o.beneficiary != address(0) && 
          !o.paid && 
          !o.cancelled &&
          currentTime > o.createdAt + quoteExpirySeconds + 1 days) {
        // Mark as cancelled to clean up
        o.cancelled = true;
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      _cleanupOldOffers();
    }
  }

  receive() external payable {}
}
