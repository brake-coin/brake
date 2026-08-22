# STOPAI Coin Design

Status: detailed reference draft; superseded as the working direction by
`docs/BRAKE_SIMPLE.md`; not approved for deployment or public sale

## 1. Identity

- Name: STOPAI
- Symbol: STOPAI
- Spoken name: "Stop AI coin"
- Primary line: Stop the AI race.
- Supporting line: Fund peaceful public pressure. Every fee visible. Every grant documented.
- Category: independent cultural memecoin with a cause-linked fee contribution
- Chain: Solana

STOPAI is an independent project. It is not an official token of Stop the AI Race,
Stop AI, PauseAI, OpenAI, Anthropic, Google, xAI, or RATi Open Software Foundation.
RATi may serve as the steward of a restricted grants program only after its board
formally approves the relationship.

## 2. Purpose

STOPAI exists to turn attention and project-controlled trading revenue into transparent
support for peaceful public education and civic action concerning the uncontrolled
frontier-AI race.

STOPAI does not promise to stop AI development, increase in price, generate a return,
or give holders influence over RATi or any protest organization.

## 3. Token specification

| Property | Design |
| --- | --- |
| Network | Solana mainnet-beta |
| Token program | Standard SPL Token Program |
| Supply | 1,000,000,000 STOPAI |
| Decimals | 6 |
| Transfer tax | 0% |
| Inflation | None |
| Mint authority | Permanently revoked after allocations are verified |
| Freeze authority | Permanently revoked before public launch |
| Holder yield | None |
| Revenue share | None |
| Governance rights | None |
| Treasury claim | None |
| Redemption right | None |

The first release should not use Token-2022 transfer-fee or permanent-delegate
extensions. A plain token is easier for holders and integrations to inspect and avoids
mechanics commonly associated with transfer restrictions or honeypots.

## 4. Supply allocation

| Allocation | Amount | Percentage | Constraint |
| --- | ---: | ---: | --- |
| Public launch and liquidity | 900,000,000 | 90% | Same public launch terms; no private discount |
| Community and education distribution | 50,000,000 | 5% | Published campaigns; no rewards for spam, referrals, or artificial engagement |
| Independent project operations | 50,000,000 | 5% | Six-month cliff, then linear vesting through month 24 |
| RATi OSF | 0 | 0% | RATi receives contributed fees in stable assets, not a speculative allocation |
| Private/VC sale | 0 | 0% | Prohibited |

Any allocation change requires a public revision of this design before deployment.
No allocation may be concealed behind an undisclosed wallet.

## 5. Fee contribution

STOPAI has no token-level transfer tax. The independent project will contribute:

> 100% of project-controlled creator fees and collectible liquidity-provider fees,
> net only of unavoidable blockchain and conversion costs, to RATi OSF's restricted
> STOPAI Grants Program.

"Project-controlled fees" excludes network fees, validator fees, exchange fees, and
third-party liquidity fees that the project never receives.

Fee flow:

1. A disclosed collector wallet receives creator and collectible LP fees.
2. A public indexer records every receipt.
3. Fees are harvested and converted to USDC on a published weekly schedule.
4. The resulting USDC is contributed to RATi's segregated grants vault.
5. Transaction IDs, conversion costs, and Canadian-dollar accounting values are
   published.
6. RATi awards grants under its board-approved policy.

Operations are funded separately. If the project later needs to retain a portion of
fees, it must announce a prospective policy change; previously collected money cannot
be reclassified.

## 6. Liquidity policy

- No private presale or insider launch price.
- Initial liquidity source and paired asset are disclosed before launch.
- The principal liquidity position is locked for at least 12 months.
- The locker must allow fee collection without allowing principal withdrawal.
- The lock address, position, unlock date, and renewal policy are public.
- Renewal or migration is announced at least 30 days before expiry.
- RATi funds are not used to provide speculative liquidity without separate board,
  legal, and accounting approval.
- The project never promises price support, buybacks, a price floor, or market-making.

## 7. Governance boundary

STOPAI holders do not govern RATi, its grants vault, the protest organizations, or the
token project. Token-weighted voting is not used to release grant funds.

Holders may participate in non-binding public sentiment polls. Grant proposals are
reviewed under RATi's eligibility policy, recommended by an advisory grants council,
and approved by RATi's authorized directors or delegates.

This boundary prevents wealth-based capture of the grants program and avoids implying
that STOPAI is an ownership or membership interest.

## 8. Metadata and mutability

The project deploys metadata with a project multisig as update authority while the
canonical website and content-addressed image are verified. Metadata is made immutable
before public launch, or under a separately published short stabilization window that
ends no later than 30 days after launch.

Metadata must include:

- the exact name and symbol;
- the independent-project notice;
- the canonical website;
- the immutable or content-addressed emblem;
- the risk disclosure; and
- no claim of endorsement by any beneficiary or AI company.

## 9. Visual system

The STOPAI emblem combines:

- an octagonal stop geometry;
- a mechanical brake rotor;
- a calm human stop hand;
- an interrupted circuit path; and
- signal red, warm off-white, charcoal, and a small amber accent.

The identity must not reuse the marks, typography, or trade dress of Stop AI, Stop the
AI Race, OpenAI, Anthropic, or another organization. No robot, brain, rocket, moon,
price chart, dollar sign, weapon, or apocalyptic imagery is part of the core mark.

Current concept asset: `assets/brake-emblem-concept-v1.png`.

## 10. Canonical public disclosures

Every purchase surface must display the following without requiring a click-through:

> STOPAI is a speculative cultural token and may lose all value. It provides no equity,
> yield, revenue share, governance right, redemption right, ownership of RATi OSF, or
> claim on grant funds. Buying STOPAI is not a charitable donation and receives no tax
> receipt. The independent STOPAI project contributes disclosed project-controlled fees
> to a grants program administered by RATi OSF. No protest organization or beneficiary
> endorses STOPAI unless expressly identified in a signed public partnership notice.

Prohibited promotional claims include:

- guaranteed or expected profit;
- price targets, floors, or multipliers;
- "buying helps" without explaining the fee mechanism;
- tax-deductibility;
- official partnership without written authorization;
- scarcity claims that omit unlocked allocations;
- guaranteed grant amounts;
- buybacks, burns, or treasury actions intended to increase price; and
- coordinated engagement, fake volume, or undisclosed paid promotion.

## 11. Deployment invariants

STOPAI is not deployable until all of the following are documented:

- independent project operator and jurisdiction;
- Canadian securities review;
- U.S. offering and promotion review;
- RATi articles and bylaws review;
- RATi board approval of the grants program and fee-contribution agreement;
- FINTRAC assessment;
- beneficiary or fiscal-sponsor agreement;
- canonical public website;
- fee collector and RATi grants-vault addresses;
- multisig and signer policy;
- allocation and vesting addresses;
- liquidity and lock terms;
- verified metadata and image hash;
- mint and freeze revocation procedure;
- public risk disclosure;
- accounting and reconciliation procedure;
- incident-response and partner-withdrawal procedure; and
- full testnet rehearsal.

## 12. Open decisions

The following remain intentionally unset:

- independent project legal entity;
- launch venue;
- paired liquidity asset and amount;
- liquidity locker;
- collector and vault addresses;
- vesting program;
- metadata storage location;
- canonical domain;
- partner/fiscal sponsor;
- launch jurisdiction restrictions; and
- launch date.

These are due-diligence decisions, not marketing decisions.
